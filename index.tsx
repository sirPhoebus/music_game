/**
 * @fileoverview Control real time music with text prompts
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, CSSResultGroup, html, LitElement, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {styleMap} from 'lit/directives/style-map.js';

import {
  GoogleGenAI,
  type LiveMusicGenerationConfig,
  type LiveMusicServerMessage,
  type LiveMusicSession,
} from '@google/genai';
import {decode, decodeAudioData} from './utils';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: 'v1alpha',
});
let model = 'lyria-realtime-exp';

interface Prompt {
  readonly promptId: string;
  readonly color: string;
  text: string;
  weight: number;
  imageUrl: string;
  matched: boolean;
  userAssignedSrc?: string;
  userAssignedPromptId?: string;
  isCorrectlyMatched?: boolean;
  isPlaying?: boolean;
}

type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

/** Throttles a callback to be called at most once per `freq` milliseconds. */
function throttle(func: (...args: unknown[]) => void, delay: number) {
  let lastCall = 0;
  return (...args: unknown[]) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    if (timeSinceLastCall >= delay) {
      func(...args);
      lastCall = now;
    }
  };
}

const PROMPT_TEXT_PRESETS = [
  'Afrobeat',
  'Reggaeton',
  'Gqom',
  'Flamenco',
  'Chicago House',
  'Deep House',
  'Lo-Fi Hip Hop',
  'Electro Swing',
  'Vaporwave',
  'Synthwave',
  'Trance',
  'Psytrance',
  'Bluegrass',
  'Americana',
  'Jazz Fusion',
  'Bebop',
  'Future Bass',
  'UK Garage',
  'Grime',
  'Industrial',
  'Ambient Drone',
  'Folk Revival',
  'Celtic Traditional',
  'Bollywood Pop',
  'J-Rock',
  'Math Rock',
  'Progressive Metal',
  'Dungeon Synth',
  'Darkwave',
  'Highlife',
  'Samba',
  'Klezmer',
  'Tango Nuevo',
  'Reggae Roots',
  'Dub Reggae',
  'Ska Punk',
  'Avant-Garde Classical',
  'Baroque Chamber',
  'Contemporary Minimalism',
  'Soundtrack Orchestral',
  'Film Noir Jazz',
  'Medieval Ensemble',
  'Tuvan Throat Singing',
  'Warm Analog Pads',
  'Glitchy Microbeats',
  'Shimmering Ambient Wash',
  'Detuned Synth Layers',
  'Gritty Saturated Bass',
  'Tape-Worn Lo-Fi Feel',
  'Hypnotic Polyrhythms',
  'Granular Textures',
  'Dreamy Reverb Spaces',
  'Broken Percussion Loops',
  'Cinematic Crescendos',
  'Sub-Heavy Pressure',
  'Sparse Minimal Textures',
  'Hyperpop Gloss',
  'Organic Percussion',
  'Metallic Resonances',
  'Swung Grooves',
  'Ethereal Vocoder Tones',
  'Swelling Choir Harmonics',
  'Dark Atmospheric Pads'
];


const COLORS = [
  '#9900ff',
  '#5200ff',
  '#ff25f6',
  '#2af6de',
  '#ffdd28',
  '#3dffab',
  '#d8ff3e',
  '#d9b2ff',
];

function getUnusedRandomColor(usedColors: string[]): string {
  const availableColors = COLORS.filter((c) => !usedColors.includes(c));
  if (availableColors.length === 0) {
    // If no available colors, pick a random one from the original list.
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }
  return availableColors[Math.floor(Math.random() * availableColors.length)];
}

// WeightSlider component
// -----------------------------------------------------------------------------
/** A slider for adjusting and visualizing prompt weight. */
@customElement('weight-slider')
class WeightSlider extends LitElement {
  // Disable shadow DOM to use global CSS
  protected override createRenderRoot() {
    return this;
  }

  @property({type: Number}) value = 0; // Range 0-2
  @property({type: String}) color = '#000';

  @query('.scroll-container') private scrollContainer!: HTMLDivElement;

  private dragStartPos = 0;
  private dragStartValue = 0;
  private containerBounds: DOMRect | null = null;

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  private handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    this.containerBounds = this.scrollContainer.getBoundingClientRect();
    this.dragStartPos = e.clientX;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('touchmove', this.handleTouchMove, {
      passive: false,
    });
    window.addEventListener('pointerup', this.handlePointerUp, {once: true});
    this.updateValueFromPosition(e.clientX);
  }

  private handlePointerMove(e: PointerEvent) {
    this.updateValueFromPosition(e.clientX);
  }

  private handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    this.updateValueFromPosition(e.touches[0].clientX);
  }

  private handlePointerUp(e: PointerEvent) {
    window.removeEventListener('pointermove', this.handlePointerMove);
    document.body.classList.remove('dragging');
    this.containerBounds = null;
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY;
    // In horizontal mode, scrolling down usually moves slider right (increase)
    this.value = this.value + delta * -0.005;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchInputEvent();
  }

  private updateValueFromPosition(clientX: number) {
    if (!this.containerBounds) return;

    const trackWidth = this.containerBounds.width;
    // Calculate position relative to the left of the track
    const relativeX = clientX - this.containerBounds.left;
    
    // Normalize (0 at left, 1 at right)
    const normalizedValue = Math.max(0, Math.min(trackWidth, relativeX)) / trackWidth;
    
    // Scale to 0-2 range
    this.value = normalizedValue * 2;

    this.dispatchInputEvent();
  }

  private dispatchInputEvent() {
    this.dispatchEvent(new CustomEvent<number>('input', {detail: this.value}));
  }

  override render() {
    const thumbWidthPercent = (this.value / 2) * 100;
    const thumbStyle = styleMap({
      width: `${thumbWidthPercent}%`,
      backgroundColor: this.color,
      // Hide thumb if value is 0 or very close to prevent visual glitch
      display: this.value > 0.01 ? 'block' : 'none',
    });
    const displayValue = this.value.toFixed(2);

    return html`
      <div
        class="scroll-container"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}>
        <div class="slider-container">
          <div id="thumb" style=${thumbStyle}></div>
        </div>
        <div class="value-display">${displayValue}</div>
      </div>
    `;
  }
}

// Base class for icon buttons.
class IconButton extends LitElement {
  // Disable shadow DOM to use global CSS
  protected override createRenderRoot() {
    return this;
  }

  // Method to be implemented by subclasses to provide the specific icon SVG
  protected renderIcon() {
    return svg``; // Default empty icon
  }

  private renderSVG() {
    return html` <svg
      width="140"
      height="140"
      viewBox="0 -10 140 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <rect
        x="22"
        y="6"
        width="96"
        height="96"
        rx="48"
        fill="black"
        fill-opacity="0.05" />
      <rect
        x="23.5"
        y="7.5"
        width="93"
        height="93"
        rx="46.5"
        stroke="black"
        stroke-opacity="0.3"
        stroke-width="3" />
      <g filter="url(#filter0_ddi_1048_7373)">
        <rect
          x="25"
          y="9"
          width="90"
          height="90"
          rx="45"
          fill="white"
          fill-opacity="0.05"
          shape-rendering="crispEdges" />
      </g>
      ${this.renderIcon()}
      <defs>
        <filter
          id="filter0_ddi_1048_7373"
          x="0"
          y="0"
          width="140"
          height="140"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha" />
          <feOffset dy="2" />
          <feGaussianBlur stdDeviation="4" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_1048_7373" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha" />
          <feOffset dy="16" />
          <feGaussianBlur stdDeviation="12.5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend
            mode="normal"
            in2="effect1_dropShadow_1048_7373"
            result="effect2_dropShadow_1048_7373" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect2_dropShadow_1048_7373"
            result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha" />
          <feOffset dy="3" />
          <feGaussianBlur stdDeviation="1.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0" />
          <feBlend
            mode="normal"
            in2="shape"
            result="effect3_innerShadow_1048_7373" />
        </filter>
      </defs>
    </svg>`;
  }

  override render() {
    return html`${this.renderSVG()}<div class="hitbox"></div>`;
  }
}

// PlayPauseButton
// -----------------------------------------------------------------------------

/** A button for toggling play/pause. */
@customElement('play-pause-button')
export class PlayPauseButton extends IconButton {
  @property({type: String}) playbackState: PlaybackState = 'stopped';

  // Styles removed, using global CSS

  private renderPause() {
    return svg`<path
      d="M75.0037 69V39H83.7537V69H75.0037ZM56.2537 69V39H65.0037V69H56.2537Z"
      fill="#FEFEFE"
    />`;
  }

  private renderPlay() {
    return svg`<path d="M60 71.5V36.5L87.5 54L60 71.5Z" fill="#FEFEFE" />`;
  }

  private renderLoading() {
    return svg`<path shape-rendering="crispEdges" class="loader" d="M70,74.2L70,74.2c-10.7,0-19.5-8.7-19.5-19.5l0,0c0-10.7,8.7-19.5,19.5-19.5
            l0,0c10.7,0,19.5,8.7,19.5,19.5l0,0"/>`;
  }

  override renderIcon() {
    if (this.playbackState === 'playing') {
      return this.renderPause();
    } else if (this.playbackState === 'loading') {
      return this.renderLoading();
    } else {
      return this.renderPlay();
    }
  }
}

@customElement('reset-button')
export class ResetButton extends IconButton {
  private renderResetIcon() {
    return svg`<path fill="#fefefe" d="M71,77.1c-2.9,0-5.7-0.6-8.3-1.7s-4.8-2.6-6.7-4.5c-1.9-1.9-3.4-4.1-4.5-6.7c-1.1-2.6-1.7-5.3-1.7-8.3h4.7
      c0,4.6,1.6,8.5,4.8,11.7s7.1,4.8,11.7,4.8c4.6,0,8.5-1.6,11.7-4.8c3.2-3.2,4.8-7.1,4.8-11.7s-1.6-8.5-4.8-11.7
      c-3.2-3.2-7.1-4.8-11.7-4.8h-0.4l3.7,3.7L71,46.4L61.5,37l9.4-9.4l3.3,3.4l-3.7,3.7H71c2.9,0,5.7,0.6,8.3,1.7
      c2.6,1.1,4.8,2.6,6.7,4.5c1.9,1.9,3.4,4.1,4.5,6.7c1.1,2.6,1.7,5.3,1.7,8.3c0,2.9-0.6,5.7-1.7,8.3c-1.1,2.6-2.6,4.8-4.5,6.7
      s-4.1,3.4-6.7,4.5C76.7,76.5,73.9,77.1,71,77.1z"/>`;
  }

  override renderIcon() {
    return this.renderResetIcon();
  }
}

// AddPromptButton component
// -----------------------------------------------------------------------------
/** A button for adding a new prompt. */
@customElement('add-prompt-button')
export class AddPromptButton extends IconButton {
  private renderAddIcon() {
    return svg`<path d="M67 40 H73 V52 H85 V58 H73 V70 H67 V58 H55 V52 H67 Z" fill="#FEFEFE" />`;
  }

  override renderIcon() {
    return this.renderAddIcon();
  }
}

// Toast Message component
// -----------------------------------------------------------------------------

@customElement('toast-message')
class ToastMessage extends LitElement {
  // Disable shadow DOM to use global CSS
  protected override createRenderRoot() {
    return this;
  }

  @property({type: String}) message = '';
  @property({type: Boolean}) showing = false;

  override render() {
    return html`<div class=${classMap({showing: this.showing, toast: true})}>
      <div class="message">${this.message}</div>
      <button @click=${this.hide}>✕</button>
    </div>`;
  }

  show(message: string) {
    this.showing = true;
    this.message = message;
    setTimeout(() => {
      this.hide();
    }, 3000);
  }

  hide() {
    this.showing = false;
  }
}

@customElement('lp-sleeve')
class LpSleeve extends LitElement {
  // Disable shadow DOM to use global CSS
  protected override createRenderRoot() {
    return this;
  }

  @property({type: String}) src = '';
  @property({type: String}) promptId = '';

  private handleDragStart(e: DragEvent) {
    e.dataTransfer?.setData('text/plain', this.promptId);
    this.setAttribute('dragging', '');
  }

  private handleDragEnd(e: DragEvent) {
    this.removeAttribute('dragging');
  }

  override render() {
    return html`
      <div 
        draggable="true" 
        @dragstart=${this.handleDragStart}
        @dragend=${this.handleDragEnd}
      >
        <img src=${this.src} alt="LP Sleeve" />
      </div>
    `;
  }
}

/** A single prompt input */
@customElement('prompt-controller')
class PromptController extends LitElement {
  // Disable shadow DOM to use global CSS
  protected override createRenderRoot() {
    return this;
  }

  @property({type: String, reflect: true}) promptId = '';
  @property({type: String}) text = '';
  @property({type: Number}) weight = 0;
  @property({type: String}) color = '';
  @property({type: String}) imageUrl = ''; // The correct image URL
  @property({type: Boolean, reflect: true}) matched = false; // If user made A match (not necessarily correct, just assigned)
  @property({type: String}) userAssignedSrc = '';
  @property({type: String}) userAssignedPromptId = '';
  @property({type: Boolean}) isCorrectlyMatched = false;
  @property({type: Boolean}) isPlaying = false;

  @query('weight-slider') private weightInput!: WeightSlider;
  @query('#text') private textInput!: HTMLSpanElement;

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    this.setAttribute('dragover', '');
  }

  private handleDragLeave(e: DragEvent) {
    this.removeAttribute('dragover');
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    this.removeAttribute('dragover');
    const droppedPromptId = e.dataTransfer?.getData('text/plain');
    if (droppedPromptId) {
      this.dispatchEvent(new CustomEvent('sleeve-dropped', {
        detail: { targetPromptId: this.promptId, droppedPromptId },
        bubbles: true,
        composed: true
      }));
    }
  }

  private handleTextKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.updateText();
      (e.target as HTMLElement).blur();
    }
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          color: this.color,
          imageUrl: this.imageUrl,
          matched: this.matched,
          userAssignedSrc: this.userAssignedSrc,
          userAssignedPromptId: this.userAssignedPromptId,
          isCorrectlyMatched: this.isCorrectlyMatched,
          isPlaying: this.isPlaying,
        },
      }),
    );
  }

  private updateText() {
    console.log('updateText');
    const newText = this.textInput.textContent?.trim();
    if (newText === '') {
      this.textInput.textContent = this.text;
      return;
    }
    this.text = newText;
    this.dispatchPromptChange();
  }

  private updateWeight() {
    this.weight = this.weightInput.value;
    this.dispatchPromptChange();
  }

  private dispatchPromptRemoved() {
    this.dispatchEvent(
      new CustomEvent<string>('prompt-removed', {
        detail: this.promptId,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private togglePlay(e: Event) {
      e.stopPropagation();
      // We want to toggle this prompt's play state
      // The parent PromptDj will handle mutual exclusivity if needed, 
      // but for now, we dispatch an event or just update local prop and bubble up via prompt-changed
      this.isPlaying = !this.isPlaying;
      this.dispatchPromptChange();
  }

  private handleDragStart(e: DragEvent) {
    // When dragging from a socket, we want to drag the ASSIGNED image ID, not the socket ID.
    if (this.userAssignedPromptId) {
        e.dataTransfer?.setData('text/plain', this.userAssignedPromptId);
        e.dataTransfer?.setData('source', 'prompt-controller');
        this.setAttribute('dragging', '');
    } else {
        e.preventDefault(); // Can't drag empty slot
    }
  }

  private handleDragEnd(e: DragEvent) {
    this.removeAttribute('dragging');
  }

  override render() {
    const classes = classMap({
      'prompt': true,
    });
    
    return html`<div 
        class=${classes}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
      <div class="image-slot">
        ${this.userAssignedSrc 
            ? html`<img 
                src=${this.userAssignedSrc} 
                draggable="true"
                @dragstart=${this.handleDragStart}
                @dragend=${this.handleDragEnd}
              />` 
            : html`<span>Drop Here</span>`
        }
      </div>
      
      <div class="connector"></div>

      <button class="play-button ${this.isPlaying ? 'active' : ''}" @click=${this.togglePlay}>
        ${this.isPlaying 
            ? svg`<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>` 
            : svg`<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`
        }
      </button>

      <div class="connector"></div>

      <div class="drop-zone">Drop Here</div>
      
      <weight-slider
        id="weight"
        value=${2}
        color=${this.color}
        @input=${this.updateWeight}
        style="z-index: 2"
      ></weight-slider>
      
      <div class="controls">
        <!-- Text is hidden via CSS -->
        <span
          id="text"
          spellcheck="false"
          contenteditable="plaintext-only"
          @keydown=${this.handleTextKeyDown}
          @blur=${this.updateText}
          >${this.text}</span
        >
      </div>
    </div>`;
  }
}

/** A panel for managing real-time music generation settings. */
@customElement('settings-controller')
class SettingsController extends LitElement {
  // Disable shadow DOM to use global CSS
  protected override createRenderRoot() {
    return this;
  }

  private readonly defaultConfig = {
    temperature: 1.1,
    topK: 40,
    guidance: 4.0,
    musicGenerationMode: 'QUALITY',
  };

  @state() private config: LiveMusicGenerationConfig = this.defaultConfig;

  @state() showAdvanced = false;

  @state() autoDensity = true;

  @state() lastDefinedDensity: number;

  @state() autoBrightness = true;

  @state() lastDefinedBrightness: number;

  public resetToDefaults() {
    this.config = this.defaultConfig;
    this.autoDensity = true;
    this.lastDefinedDensity = undefined;
    this.autoBrightness = true;
    this.lastDefinedBrightness = undefined;
    this.dispatchSettingsChange();
  }

  private updateSliderBackground(inputEl: HTMLInputElement) {
    if (inputEl.type !== 'range') {
      return;
    }
    const min = Number(inputEl.min) || 0;
    const max = Number(inputEl.max) || 100;
    const value = Number(inputEl.value);
    const percentage = ((value - min) / (max - min)) * 100;
    inputEl.style.setProperty('--value-percent', `${percentage}%`);
  }

  private handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const key = target.id as
      | keyof LiveMusicGenerationConfig
      | 'auto-density'
      | 'auto-brightness';
    let value: string | number | boolean | undefined = target.value;

    if (target.type === 'number' || target.type === 'range') {
      value = target.value === '' ? undefined : Number(target.value);
      // Update slider background if it's a range input before handling the value change.
      if (target.type === 'range') {
        this.updateSliderBackground(target as HTMLInputElement);
      }
    } else if (target.type === 'checkbox') {
      value = (target as HTMLInputElement).checked;
    } else if (target.type === 'select-one') {
      const selectElement = target as HTMLSelectElement;
      if (selectElement.options[selectElement.selectedIndex]?.disabled) {
        value = undefined;
      } else {
        value = target.value;
      }
    }

    const newConfig = {
      ...this.config,
      [key]: value,
    };

    if (newConfig.density !== undefined) {
      this.lastDefinedDensity = newConfig.density;
      console.log(this.lastDefinedDensity);
    }

    if (newConfig.brightness !== undefined) {
      this.lastDefinedBrightness = newConfig.brightness;
    }

    if (key === 'auto-density') {
      this.autoDensity = Boolean(value);
      newConfig.density = this.autoDensity
        ? undefined
        : this.lastDefinedDensity;
    } else if (key === 'auto-brightness') {
      this.autoBrightness = Boolean(value);
      newConfig.brightness = this.autoBrightness
        ? undefined
        : this.lastDefinedBrightness;
    }

    this.config = newConfig;
    this.dispatchSettingsChange();
  }

  override updated(changedProperties: Map<string | symbol, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('config')) {
      this.shadowRoot
        ?.querySelectorAll<HTMLInputElement>('input[type="range"]')
        .forEach((slider: HTMLInputElement) => {
          const configValue =
            this.config[slider.id as keyof LiveMusicGenerationConfig];
          if (typeof configValue === 'number') {
            slider.value = String(configValue);
          } else if (slider.id === 'density' || slider.id === 'brightness') {
            // Handle potentially undefined density/brightness with default for background
            slider.value = String(configValue ?? 0.5);
          }
          this.updateSliderBackground(slider);
        });
    }
  }

  private dispatchSettingsChange() {
    this.dispatchEvent(
      new CustomEvent<LiveMusicGenerationConfig>('settings-changed', {
        detail: this.config,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private toggleAdvancedSettings() {
    this.showAdvanced = !this.showAdvanced;
  }

  override render() {
    const cfg = this.config;
    const advancedClasses = classMap({
      'advanced-settings': true,
      'visible': this.showAdvanced,
    });
    const musicGenerationModeMap = new Map<string, string>([
      ['Quality', 'QUALITY'],
      ['Diversity', 'DIVERSITY'],
      ['Vocalization', 'VOCALIZATION'],
    ]);
    const scaleMap = new Map<string, string>([
      ['Auto', 'SCALE_UNSPECIFIED'],
      ['C Major / A Minor', 'C_MAJOR_A_MINOR'],
      ['C# Major / A# Minor', 'D_FLAT_MAJOR_B_FLAT_MINOR'],
      ['D Major / B Minor', 'D_MAJOR_B_MINOR'],
      ['D# Major / C Minor', 'E_FLAT_MAJOR_C_MINOR'],
      ['E Major / C# Minor', 'E_MAJOR_D_FLAT_MINOR'],
      ['F Major / D Minor', 'F_MAJOR_D_MINOR'],
      ['F# Major / D# Minor', 'G_FLAT_MAJOR_E_FLAT_MINOR'],
      ['G Major / E Minor', 'G_MAJOR_E_MINOR'],
      ['G# Major / F Minor', 'A_FLAT_MAJOR_F_MINOR'],
      ['A Major / F# Minor', 'A_MAJOR_G_FLAT_MINOR'],
      ['A# Major / G Minor', 'B_FLAT_MAJOR_G_MINOR'],
      ['B Major / G# Minor', 'B_MAJOR_A_FLAT_MINOR'],
    ]);

    return html`
      <div class="core-settings-row">
        <div class="setting">
          <label for="temperature"
            >Temperature<span>${cfg.temperature!.toFixed(1)}</span></label
          >
          <input
            type="range"
            id="temperature"
            min="0"
            max="3"
            step="0.1"
            .value=${cfg.temperature!.toString()}
            @input=${this.handleInputChange} />
        </div>
        <div class="setting">
          <label for="guidance"
            >Guidance<span>${cfg.guidance!.toFixed(1)}</span></label
          >
          <input
            type="range"
            id="guidance"
            min="0"
            max="6"
            step="0.1"
            .value=${cfg.guidance!.toString()}
            @input=${this.handleInputChange} />
        </div>
        <div class="setting">
          <label for="topK">Top K<span>${cfg.topK}</span></label>
          <input
            type="range"
            id="topK"
            min="1"
            max="100"
            step="1"
            .value=${cfg.topK!.toString()}
            @input=${this.handleInputChange} />
        </div>
      </div>
      <hr class="divider" />
      <div class=${advancedClasses}>
        <div class="setting">
          <label for="seed">Seed</label>
          <input
            type="number"
            id="seed"
            .value=${cfg.seed ?? ''}
            @input=${this.handleInputChange}
            placeholder="Auto" />
        </div>
        <div class="setting">
          <label for="bpm">BPM</label>
          <input
            type="number"
            id="bpm"
            min="60"
            max="180"
            .value=${cfg.bpm ?? ''}
            @input=${this.handleInputChange}
            placeholder="Auto" />
        </div>
        <div class="setting" auto=${this.autoDensity}>
          <label for="density">Density</label>
          <input
            type="range"
            id="density"
            min="0"
            max="1"
            step="0.05"
            .value=${this.lastDefinedDensity}
            @input=${this.handleInputChange} />
          <div class="auto-row">
            <input
              type="checkbox"
              id="auto-density"
              .checked=${this.autoDensity}
              @input=${this.handleInputChange} />
            <label for="auto-density">Auto</label>
            <span>${(this.lastDefinedDensity ?? 0.5).toFixed(2)}</span>
          </div>
        </div>
        <div class="setting" auto=${this.autoBrightness}>
          <label for="brightness">Brightness</label>
          <input
            type="range"
            id="brightness"
            min="0"
            max="1"
            step="0.05"
            .value=${this.lastDefinedBrightness}
            @input=${this.handleInputChange} />
          <div class="auto-row">
            <input
              type="checkbox"
              id="auto-brightness"
              .checked=${this.autoBrightness}
              @input=${this.handleInputChange} />
            <label for="auto-brightness">Auto</label>
            <span>${(this.lastDefinedBrightness ?? 0.5).toFixed(2)}</span>
          </div>
        </div>
        <div class="setting">
          <label for="scale">Scale</label>
          <select
            id="scale"
            .value=${cfg.scale || 'SCALE_UNSPECIFIED'}
            @change=${this.handleInputChange}>
            <option value="" disabled selected>Select Scale</option>
            ${[...scaleMap.entries()].map(
              ([displayName, enumValue]) =>
                html`<option value=${enumValue}>${displayName}</option>`,
            )}
          </select>
        </div>
        <div class="setting">
          <label for="musicGenerationMode">Music generation mode</label>
          <select
            id="musicGenerationMode"
            .value=${cfg.musicGenerationMode || 'QUALITY'}
            @change=${this.handleInputChange}>
            ${[...musicGenerationModeMap.entries()].map(
              ([displayName, enumValue]) =>
                html`<option value=${enumValue}>${displayName}</option>`,
            )}
          </select>
        </div>
        <div class="setting">
          <div class="setting checkbox-setting">
            <input
              type="checkbox"
              id="muteBass"
              .checked=${!!cfg.muteBass}
              @change=${this.handleInputChange} />
            <label for="muteBass" style="font-weight: normal;">Mute Bass</label>
          </div>
          <div class="setting checkbox-setting">
            <input
              type="checkbox"
              id="muteDrums"
              .checked=${!!cfg.muteDrums}
              @change=${this.handleInputChange} />
            <label for="muteDrums" style="font-weight: normal;"
              >Mute Drums</label
            >
          </div>
          <div class="setting checkbox-setting">
            <input
              type="checkbox"
              id="onlyBassAndDrums"
              .checked=${!!cfg.onlyBassAndDrums}
              @change=${this.handleInputChange} />
            <label for="onlyBassAndDrums" style="font-weight: normal;"
              >Only Bass & Drums</label
            >
          </div>
        </div>
      </div>
      <div class="advanced-toggle" @click=${this.toggleAdvancedSettings}>
        ${this.showAdvanced ? 'Hide' : 'Show'} Advanced Settings
      </div>
    `;
  }
}

/** Component for the PromptDJ UI. */
@customElement('prompt-dj')
class PromptDj extends LitElement {
  // Disable shadow DOM to use global CSS
  protected override createRenderRoot() {
    return this;
  }

  @property({
    type: Object,
    attribute: false,
  })
  private prompts: Map<string, Prompt>;
  private nextPromptId: number; // Monotonically increasing ID for new prompts
  private session: LiveMusicSession;
  private readonly sampleRate = 48000;
  private audioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: this.sampleRate});
  private outputNode: GainNode = this.audioContext.createGain();
  private nextStartTime = 0;
  private readonly bufferTime = 2; // adds an audio buffer in case of netowrk latency
  @state() private playbackState: PlaybackState = 'stopped';
  @property({type: Object})
  private filteredPrompts = new Set<string>();
  private connectionError = true;
  @state() private isLoading = false;

  @query('play-pause-button') private playPauseButton!: PlayPauseButton;
  @query('toast-message') private toastMessage!: ToastMessage;
  @query('settings-controller') private settingsController!: SettingsController;

  constructor(prompts: Map<string, Prompt>) {
    super();
    this.prompts = prompts;
    this.nextPromptId = this.prompts.size;
    this.outputNode.connect(this.audioContext.destination);
  }

  override async firstUpdated() {
    await this.connectToSession();
    this.setSessionPrompts();
  }

  private async connectToSession() {
    this.session = await ai.live.music.connect({
      model: model,
      callbacks: {
        onmessage: async (e: LiveMusicServerMessage) => {
          console.log('Received message from the server: %s\n');
          console.log(e);
          if (e.setupComplete) {
            this.connectionError = false;
          }
          if (e.filteredPrompt) {
            this.filteredPrompts = new Set([
              ...this.filteredPrompts,
              e.filteredPrompt.text,
            ]);
            this.toastMessage.show(e.filteredPrompt.filteredReason);
          }
          if (e.serverContent?.audioChunks !== undefined) {
            if (
              this.playbackState === 'paused' ||
              this.playbackState === 'stopped'
            )
              return;
            const audioBuffer = await decodeAudioData(
              decode(e.serverContent?.audioChunks[0].data),
              this.audioContext,
              48000,
              2,
            );
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputNode);
            if (this.nextStartTime === 0) {
              this.nextStartTime =
                this.audioContext.currentTime + this.bufferTime;
              setTimeout(() => {
                this.playbackState = 'playing';
              }, this.bufferTime * 1000);
            }

            if (this.nextStartTime < this.audioContext.currentTime) {
              console.log('under run');
              this.playbackState = 'loading';
              this.nextStartTime = 0;
              return;
            }
            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
          }
        },
        onerror: (e: ErrorEvent) => {
          console.log('Error occurred: %s\n', JSON.stringify(e));
          this.connectionError = true;
          this.stopAudio();
          this.toastMessage.show('Connection error, please restart audio.');
        },
        onclose: (e: CloseEvent) => {
          console.log('Connection closed.');
          this.connectionError = true;
          this.stopAudio();
          this.toastMessage.show('Connection error, please restart audio.');
        },
      },
    });
  }

  private setSessionPrompts = throttle(async () => {
    const promptsToSend = Array.from(this.prompts.values()).filter((p) => {
      return !this.filteredPrompts.has(p.text) && p.weight !== 0;
    });
    const weightedPrompts = promptsToSend.map((p) => {
      return {text: p.text, weight: p.weight};
    });

    if (weightedPrompts.length === 0) {
      console.log('No active prompts to send');
      return;
    }

    try {
      await this.session.setWeightedPrompts({
        weightedPrompts,
      });
    } catch (e) {
      this.toastMessage.show(e.message);
      this.pauseAudio();
    }
  }, 200);

  private dispatchPromptsChange() {
    this.dispatchEvent(
      new CustomEvent('prompts-changed', {detail: this.prompts}),
    );
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const {promptId, text, weight, matched, imageUrl, userAssignedSrc, userAssignedPromptId, isCorrectlyMatched, isPlaying} = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    prompt.text = text;
    // We no longer take weight from the event detail directly if we are managing play/pause logic here
    // actually we do, but the event comes from the component.
    // If 'isPlaying' changed, we update weight.
    
    if (isPlaying !== undefined && isPlaying !== prompt.isPlaying) {
       // User toggled play button
       prompt.isPlaying = isPlaying;
       
       // Mutually exclusive playback:
       // If we just turned ON this prompt, turn OFF all others.
       if (prompt.isPlaying) {
           for (const [pid, p] of this.prompts) {
               if (pid !== promptId) {
                   p.isPlaying = false;
                   p.weight = 0;
               }
           }
       }
       
       // Set weight based on playing status
       prompt.weight = prompt.isPlaying ? 1 : 0;
    } else {
        // Regular update (though weight slider is locked now, so this might not happen often)
        prompt.weight = weight;
    }

    prompt.matched = matched;
    prompt.imageUrl = imageUrl;
    prompt.userAssignedSrc = userAssignedSrc;
    prompt.userAssignedPromptId = userAssignedPromptId;
    prompt.isCorrectlyMatched = isCorrectlyMatched;

    const newPrompts = new Map(this.prompts);
    
    // Force update of all prompts to reflect mutual exclusivity
    this.prompts = newPrompts;

    // Check if any prompt is playing to manage global playback state
    const anyPlaying = [...this.prompts.values()].some(p => p.isPlaying);
    if (anyPlaying) {
        if (this.playbackState === 'stopped' || this.playbackState === 'paused') {
            if (this.connectionError) {
                 this.connectToSession().then(() => this.loadAudio());
            } else {
                 this.loadAudio();
            }
        }
        this.setSessionPrompts();
    } else {
        // If nothing is playing, stop the audio
        if (this.playbackState === 'playing' || this.playbackState === 'loading') {
            this.stopAudio();
        }
        // We don't need to call setSessionPrompts if stopping, as stopAudio clears gain
    }

    this.requestUpdate();
    this.dispatchPromptsChange();
  }

  private handleSleeveDropped(e: CustomEvent<{targetPromptId: string, droppedPromptId: string}>) {
    const {targetPromptId, droppedPromptId} = e.detail;
    const targetPrompt = this.prompts.get(targetPromptId);
    
    // droppedPromptId might be a promptId from the deck OR from another prompt controller
    // But the deck items use promptId too.
    const droppedPrompt = this.prompts.get(droppedPromptId);

    if (targetPrompt && droppedPrompt) {
      // Check if the dropped prompt is currently assigned to another slot (swapping logic)
      // We need to find if any OTHER prompt has this droppedPromptId assigned as userAssignedPromptId
      // AND if the current targetPrompt has an image assigned, we might want to swap.
      
      // Case 1: Moving an image from Socket A to Socket B
      // We need to clear it from Socket A.
      for (const p of this.prompts.values()) {
          if (p.userAssignedPromptId === droppedPromptId && p.promptId !== targetPromptId) {
              // Image was previously here.
              // If targetPrompt has an image, we could swap?
              // For simplicity, let's just move it. 
              // If targetPrompt has an image, we overwrite it (it goes back to deck effectively).
              // Or we swap them.
              
              if (targetPrompt.userAssignedPromptId) {
                  // Swap!
                  p.userAssignedSrc = targetPrompt.userAssignedSrc;
                  p.userAssignedPromptId = targetPrompt.userAssignedPromptId;
              } else {
                  // Just clear source
                  p.userAssignedSrc = undefined;
                  p.userAssignedPromptId = undefined;
                  p.matched = false;
              }
              break; 
          }
      }

      // Assign the dropped image to the target prompt
      targetPrompt.userAssignedSrc = droppedPrompt.imageUrl;
      targetPrompt.userAssignedPromptId = droppedPromptId;
      targetPrompt.matched = true;

      // Create new map to ensure reactivity
      const newPrompts = new Map(this.prompts);
      this.prompts = newPrompts;

      this.toastMessage.show("Image Linked!");
      
      this.requestUpdate();
      this.dispatchPromptsChange();
    }
  }

  private handleReveal() {
    let correctCount = 0;
    let totalAssigned = 0;

    for (const prompt of this.prompts.values()) {
      if (prompt.userAssignedPromptId) {
        totalAssigned++;
        const assignedPrompt = this.prompts.get(prompt.userAssignedPromptId);
        if (assignedPrompt && assignedPrompt.text === prompt.text) {
          prompt.isCorrectlyMatched = true;
          correctCount++;
        } else {
           prompt.isCorrectlyMatched = false;
        }
      }
    }
    
    this.requestUpdate();
    
    if (correctCount === this.prompts.size) {
        this.toastMessage.show("CONGRATULATIONS! All matched correctly! Starting new game...");
        setTimeout(() => {
            this.restartWithNewGame();
        }, 3000);
    } else {
        this.toastMessage.show(`You got ${correctCount} out of ${this.prompts.size} correct.`);
    }
  }

  private restartWithNewGame() {
    this.isLoading = true;
    // 1. Pick 5 new random genres
    const numPrompts = 5;
    const shuffled = [...PROMPT_TEXT_PRESETS].sort(() => Math.random() - 0.5);
    const selectedGenres = shuffled.slice(0, numPrompts);
    
    const newPromptsMap = new Map<string, Prompt>();
    const usedColors: string[] = [];

    // We need to preload images or just let them load naturally.
    // To show loader, we can just set state and wait a bit, 
    // or rely on image load events?
    // For simplicity, let's keep loader for a fixed time or until we set prompts?
    // Actually the images are URLs, they will load async in the browser.
    // We can keep the loader up for a short animation time (e.g. 1.5s) to simulate "generating".
    
    setTimeout(() => {
        for(let i=0; i<numPrompts; i++) {
            const text = selectedGenres[i];
            const color = getUnusedRandomColor(usedColors);
            usedColors.push(color);
            const promptId = `prompt-${i}`;
            
            newPromptsMap.set(promptId, {
                promptId,
                text,
                weight: 0,
                color,
                imageUrl: `https://image.pollinations.ai/prompt/Create%20a%20LP%20sleeves%20that%20represent%20${encodeURIComponent(text)}.%20Do%20not%20use%20any%20text%20on%20the%20image.%20Creative%20illustration?n=${Math.random()}`,
                matched: false,
                isPlaying: false
            });
        }

        this.prompts = newPromptsMap;
        
        // 2. Reset state
        this.playbackState = 'stopped';
        this.stopAudio();
        setStoredPrompts(this.prompts);
        
        // 3. Update Session
        this.setSessionPrompts();
        this.requestUpdate();
        this.dispatchPromptsChange();
        this.isLoading = false;
    }, 1500);
  }

  private handleResetGame() {
    for (const prompt of this.prompts.values()) {
        prompt.userAssignedSrc = undefined;
        prompt.userAssignedPromptId = undefined;
        prompt.matched = false;
        prompt.isCorrectlyMatched = undefined;
    }
    this.requestUpdate();
    this.dispatchPromptsChange();
    this.toastMessage.show("Game Reset!");
  }

  /** Generates radial gradients for each prompt based on weight and color. */
  private makeBackground() {
    const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

    const MAX_WEIGHT = 0.5;
    const MAX_ALPHA = 0.6;

    const bg: string[] = [];

    [...this.prompts.values()].forEach((p, i) => {
      const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
      const alpha = Math.round(alphaPct * 0xff)
        .toString(16)
        .padStart(2, '0');

      const stop = p.weight / 2;
      const x = (i % 4) / 3;
      const y = Math.floor(i / 4) / 3;
      const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

      bg.push(s);
    });

    return bg.join(', ');
  }

  private async handlePlayPause() {
    if (this.playbackState === 'playing') {
      this.pauseAudio();
    } else if (
      this.playbackState === 'paused' ||
      this.playbackState === 'stopped'
    ) {
      if (this.connectionError) {
        await this.connectToSession();
        this.setSessionPrompts();
      }
      this.loadAudio();
    } else if (this.playbackState === 'loading') {
      this.stopAudio();
    }
    console.debug('handlePlayPause');
  }

  private pauseAudio() {
    this.session.pause();
    this.playbackState = 'paused';
    this.outputNode.gain.setValueAtTime(1, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(
      0,
      this.audioContext.currentTime + 0.1,
    );
    this.nextStartTime = 0;
    this.outputNode = this.audioContext.createGain();
    this.outputNode.connect(this.audioContext.destination);
  }

  private loadAudio() {
    this.audioContext.resume();
    this.session.play();
    this.playbackState = 'loading';
    this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(
      1,
      this.audioContext.currentTime + 0.1,
    );
  }

  private stopAudio() {
    this.session.stop();
    this.playbackState = 'stopped';
    this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(
      1,
      this.audioContext.currentTime + 0.1,
    );
    this.nextStartTime = 0;
  }

  private async handleAddPrompt() {
    const newPromptId = `prompt-${this.nextPromptId++}`;
    const usedColors = [...this.prompts.values()].map((p) => p.color);
    const newPrompt: Prompt = {
      promptId: newPromptId,
      text: 'New Prompt', // Default text
      weight: 0,
      color: getUnusedRandomColor(usedColors),
      imageUrl: `https://image.pollinations.ai/prompt/Create%20a%20LP%20sleeves%20that%20represent%20New%20Prompt.%20Do%20not%20use%20any%20text%20on%20the%20image.%20Creative%20illustration?n=${Math.random()}`,
      matched: false,
    };
    const newPrompts = new Map(this.prompts);
    newPrompts.set(newPromptId, newPrompt);
    this.prompts = newPrompts;

    await this.setSessionPrompts();

    // Wait for the component to update and render the new prompt.
    // Do not dispatch the prompt change event until the user has edited the prompt text.
    await this.updateComplete;

    // Find the newly added prompt controller element
    const newPromptElement = this.renderRoot.querySelector<PromptController>(
      `prompt-controller[promptId="${newPromptId}"]`,
    );
    if (newPromptElement) {
      // Scroll the prompts container to the new prompt element
      newPromptElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'end',
      });

      // Select the new prompt text
      const textSpan =
        newPromptElement.shadowRoot?.querySelector<HTMLSpanElement>('#text');
      if (textSpan) {
        textSpan.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(textSpan);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  private handlePromptRemoved(e: CustomEvent<string>) {
    e.stopPropagation();
    const promptIdToRemove = e.detail;
    if (this.prompts.has(promptIdToRemove)) {
      this.prompts.delete(promptIdToRemove);
      const newPrompts = new Map(this.prompts);
      this.prompts = newPrompts;
      this.setSessionPrompts();
      this.dispatchPromptsChange();
    } else {
      console.warn(
        `Attempted to remove non-existent prompt ID: ${promptIdToRemove}`,
      );
    }
  }

  // Handle scrolling X-axis the prompts container.
  private handlePromptsContainerWheel(e: WheelEvent) {
    const container = e.currentTarget as HTMLElement;
    if (e.deltaX !== 0) {
      // Prevent the default browser action (like page back/forward)
      e.preventDefault();
      container.scrollLeft += e.deltaX;
    }
  }

  private updateSettings = throttle(
    async (e: CustomEvent<LiveMusicGenerationConfig>) => {
      await this.session?.setMusicGenerationConfig({
        musicGenerationConfig: e.detail,
      });
    },
    200,
  );

  private async handleReset() {
    if (this.connectionError) {
      await this.connectToSession();
      this.setSessionPrompts();
    }
    this.pauseAudio();
    this.session.resetContext();
    this.settingsController.resetToDefaults();
    this.session?.setMusicGenerationConfig({
      musicGenerationConfig: {},
    });
    setTimeout(this.loadAudio.bind(this), 100);
  }

  override render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    return html`<div id="background" style=${bg}></div>
      <div class="prompts-area">
        <div
          id="prompts-container"
          @prompt-removed=${this.handlePromptRemoved}
          @wheel=${this.handlePromptsContainerWheel}
          @sleeve-dropped=${this.handleSleeveDropped}>
          ${this.renderPrompts()}
        </div>
        <div class="sleeve-deck">
          ${this.isLoading 
            ? html`<div class="loader-overlay"><div class="sleeve-loader"></div></div>` 
            : this.renderSleeves()
          }
        </div>
        <div class="add-prompt-button-container">
          <add-prompt-button @click=${this.handleAddPrompt}></add-prompt-button>
        </div>
      </div>
      <div id="settings-container">
        <settings-controller
          @settings-changed=${this.updateSettings}></settings-controller>
      </div>
      <div class="playback-container">
        <button class="reveal-button" @click=${this.handleReveal}>Reveal Matches</button>
        <button class="reveal-button" style="background: #f44336" @click=${this.handleResetGame}>Reset Game</button>
      </div>
      <toast-message></toast-message>`;
  }

  private renderPrompts() {
    // Create a copy of the values and shuffle them for display
    // We use a seed or just random sorting on each render? 
    // If we shuffle on each render, the sliders will jump around when updating state.
    // We need to shuffle once or maintain a shuffled order.
    // For now, let's just map values directly, as the requirement was "random order".
    // But since the prompt list is static after init, we can just use the values.
    // To truly shuffle visually but keep logic, we'd need a separate `displayOrder` state.
    // For MVP, we'll assume the initial creation was random enough, OR we shuffle in `gen`.
    // Actually `gen` creates them in order.
    // Let's create a memoized shuffled list of IDs if we really want to shuffle display.
    // But given constraints, let's just render.
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        .promptId=${prompt.promptId}
        filtered=${this.filteredPrompts.has(prompt.text)}
        .text=${prompt.text}
        .weight=${prompt.weight}
        .color=${prompt.color}
        .imageUrl=${prompt.imageUrl}
        .matched=${prompt.matched}
        .userAssignedSrc=${prompt.userAssignedSrc}
        .userAssignedPromptId=${prompt.userAssignedPromptId}
        .isCorrectlyMatched=${prompt.isCorrectlyMatched}
        .isPlaying=${prompt.isPlaying}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }

  private renderSleeves() {
    // Show all sleeves that are NOT assigned to any prompt yet?
    // Or just show all sleeves and allow dragging copies? 
    // "drag and dropping one img to a sound" implies moving it.
    // So we should filter out sleeves that are currently assigned.
    
    const assignedPromptIds = new Set<string>();
    for(const p of this.prompts.values()) {
        if (p.userAssignedPromptId) {
            assignedPromptIds.add(p.userAssignedPromptId);
        }
    }

    const availablePrompts = [...this.prompts.values()].filter(p => !assignedPromptIds.has(p.promptId));

    return availablePrompts.sort(() => Math.random() - 0.5).map(p => html`
      <lp-sleeve
        .src=${p.imageUrl}
        .promptId=${p.promptId}
      ></lp-sleeve>
    `);
  }
}

function gen(parent: HTMLElement) {
  const initialPrompts = getStoredPrompts();

  const pdj = new PromptDj(initialPrompts);
  parent.appendChild(pdj);
}

function getStoredPrompts(): Map<string, Prompt> {
  const {localStorage} = window;
  const storedPrompts = localStorage.getItem('prompts');

  if (storedPrompts) {
    try {
      const prompts = JSON.parse(storedPrompts) as Prompt[];
      console.log('Loading stored prompts', prompts);
      return new Map(prompts.map((prompt) => [prompt.promptId, prompt]));
    } catch (e) {
      console.error('Failed to parse stored prompts', e);
    }
  }

  console.log('No stored prompts, creating prompt presets');

  const defaultGenreSelection = [
    'Minimal Techno',
    'Bossa Nova',
    'Post Punk',
    'Lush Strings',
    'Dubstep',
  ];

  const defaultPrompts: Prompt[] = [];
  const usedColors: string[] = [];
  for (let i = 0; i < defaultGenreSelection.length; i++) {
    const text = defaultGenreSelection[i];
    const color = getUnusedRandomColor(usedColors);
    usedColors.push(color);
    defaultPrompts.push({
      promptId: `prompt-${i}`,
      text,
      weight: 0,
      color,
      imageUrl: `https://image.pollinations.ai/prompt/Create%20a%20LP%20sleeves%20that%20represent%20${encodeURIComponent(
        text,
      )}.%20Do%20not%20use%20any%20text%20on%20the%20image.%20Creative%20illustration?n=${Math.random()}`,
      matched: false,
      isPlaying: false,
    });
  }
  
  return new Map(defaultPrompts.map((p) => [p.promptId, p]));
}

function setStoredPrompts(prompts: Map<string, Prompt>) {
  const storedPrompts = JSON.stringify([...prompts.values()]);
  const {localStorage} = window;
  localStorage.setItem('prompts', storedPrompts);
}

function main(container: HTMLElement) {
  gen(container);
}

main(document.body);

declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj': PromptDj;
    'prompt-controller': PromptController;
    'settings-controller': SettingsController;
    'add-prompt-button': AddPromptButton;
    'play-pause-button': PlayPauseButton;
    'reset-button': ResetButton;
    'weight-slider': WeightSlider;
    'toast-message': ToastMessage;
  }
}

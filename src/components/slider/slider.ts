import {
  NgModule,
  Component,
  ElementRef,
  HostBinding,
  Input,
  ViewEncapsulation,
  AfterContentInit,
} from '@angular/core';
import {HAMMER_GESTURE_CONFIG} from '@angular/platform-browser';
import {BooleanFieldValue} from '@angular2-material/core/annotations/field-value';
import {applyCssTransform} from '@angular2-material/core/style/apply-transform';
import {MdGestureConfig} from '@angular2-material/core/core';

/**
 * Visually, a 30px separation between tick marks looks best. This is very subjective but it is
 * the default separation we chose.
 */
const MIN_AUTO_TICK_SEPARATION = 30;

@Component({
  moduleId: module.id,
  selector: 'md-slider',
  host: {
    'tabindex': '0',
    '(click)': 'onClick($event)',
    '(slide)': 'onSlide($event)',
    '(slidestart)': 'onSlideStart($event)',
    '(slideend)': 'onSlideEnd()',
    '(window:resize)': 'onResize()',
    '(blur)': 'onBlur()',
  },
  templateUrl: 'slider.html',
  styleUrls: ['slider.css'],
  encapsulation: ViewEncapsulation.None,
})
export class MdSlider implements AfterContentInit {
  /** A renderer to handle updating the slider's thumb and fill track. */
  private _renderer: SliderRenderer = null;

  /** The dimensions of the slider. */
  private _sliderDimensions: ClientRect = null;

  @Input()
  @BooleanFieldValue()
  @HostBinding('class.md-slider-disabled')
  @HostBinding('attr.aria-disabled')
  disabled: boolean = false;

  /** The miniumum value that the slider can have. */
  private _min: number = 0;

  /** The maximum value that the slider can have. */
  private _max: number = 100;

  /** The percentage of the slider that coincides with the value. */
  private _percent: number = 0;

  /** The values at which the thumb will snap. */
  @Input() step: number = 1;

  /**
   * How often to show ticks. Relative to the step so that a tick always appears on a step.
   * Ex: Tick interval of 4 with a step of 3 will draw a tick every 4 steps (every 12 values).
   */
  @Input('tick-interval') private _tickInterval: 'auto' | number;

  /**
   * Whether or not the thumb is sliding.
   * Used to determine if there should be a transition for the thumb and fill track.
   * TODO: internal
   */
  isSliding: boolean = false;

  /**
   * Whether or not the slider is active (clicked or sliding).
   * Used to shrink and grow the thumb as according to the Material Design spec.
   * TODO: internal
   */
  isActive: boolean = false;

  /** Indicator for if the value has been set or not. */
  private _isInitialized: boolean = false;

  /** Value of the slider. */
  private _value: number = 0;

  @Input()
  @HostBinding('attr.aria-valuemin')
  get min() {
    return this._min;
  }

  set min(v: number) {
    // This has to be forced as a number to handle the math later.
    this._min = Number(v);

    // If the value wasn't explicitly set by the user, set it to the min.
    if (!this._isInitialized) {
      this.value = this._min;
    }
  }

  @Input()
  @HostBinding('attr.aria-valuemax')
  get max() {
    return this._max;
  }

  set max(v: number) {
    this._max = Number(v);
  }

  @Input()
  @HostBinding('attr.aria-valuenow')
  get value() {
    return this._value;
  }

  set value(v: number) {
    this._value = Number(v);
    this._isInitialized = true;
  }

  constructor(elementRef: ElementRef) {
    this._renderer = new SliderRenderer(elementRef);
  }

  /**
   * Once the slider has rendered, grab the dimensions and update the position of the thumb and
   * fill track.
   * TODO: internal
   */
  ngAfterContentInit() {
    this._sliderDimensions = this._renderer.getSliderDimensions();
    this.snapToValue();
    this._updateTickSeparation();
  }

  /** TODO: internal */
  onClick(event: MouseEvent) {
    if (this.disabled) {
      return;
    }

    this.isActive = true;
    this.isSliding = false;
    this._renderer.addFocus();
    this.updateValueFromPosition(event.clientX);
    this.snapToValue();
  }

  /** TODO: internal */
  onSlide(event: HammerInput) {
    if (this.disabled) {
      return;
    }

    // Prevent the slide from selecting anything else.
    event.preventDefault();
    this.updateValueFromPosition(event.center.x);
  }

  /** TODO: internal */
  onSlideStart(event: HammerInput) {
    if (this.disabled) {
      return;
    }

    event.preventDefault();
    this.isSliding = true;
    this.isActive = true;
    this._renderer.addFocus();
    this.updateValueFromPosition(event.center.x);
  }

  /** TODO: internal */
  onSlideEnd() {
    this.isSliding = false;
      this.snapToValue();
  }

  /** TODO: internal */
  onResize() {
    this.isSliding = true;
    this._sliderDimensions = this._renderer.getSliderDimensions();
    // Skip updating the value and position as there is no new placement.
    this._renderer.updateThumbAndFillPosition(this._percent, this._sliderDimensions.width);
  }

  /** TODO: internal */
  onBlur() {
    this.isActive = false;
  }

  /**
   * When the value changes without a physical position, the percentage needs to be recalculated
   * independent of the physical location.
   * This is also used to move the thumb to a snapped value once sliding is done.
   */
  updatePercentFromValue() {
    this._percent = this.calculatePercentage(this.value);
  }

  /**
   * Calculate the new value from the new physical location. The value will always be snapped.
   */
  updateValueFromPosition(pos: number) {
    let offset = this._sliderDimensions.left;
    let size = this._sliderDimensions.width;

    // The exact value is calculated from the event and used to find the closest snap value.
    this._percent = this.clamp((pos - offset) / size);
    let exactValue = this.calculateValue(this._percent);

    // This calculation finds the closest step by finding the closest whole number divisible by the
    // step relative to the min.
    let closestValue = Math.round((exactValue - this.min) / this.step) * this.step + this.min;
    // The value needs to snap to the min and max.
    this.value = this.clamp(closestValue, this.min, this.max);
    this._renderer.updateThumbAndFillPosition(this._percent, this._sliderDimensions.width);
  }

  /**
   * Snaps the thumb to the current value.
   * Called after a click or drag event is over.
   */
  snapToValue() {
    this.updatePercentFromValue();
    this._renderer.updateThumbAndFillPosition(this._percent, this._sliderDimensions.width);
  }

  /**
   * Calculates the separation in pixels of tick marks. If there is no tick interval or the interval
   * is set to something other than a number or 'auto', nothing happens.
   */
  private _updateTickSeparation() {
    if (this._tickInterval == 'auto') {
      this._updateAutoTickSeparation();
    } else if (Number(this._tickInterval)) {
      this._updateTickSeparationFromInterval();
    }
  }

  /**
   * Calculates the separation in pixels of tick marks by starting with the assumption every step
   * needs a tick and eliminating the number of ticks until there is a distance of at least 30px
   * between each tick.
   */
  private _updateAutoTickSeparation() {
    // The pixel value for how far apart the ticks should be.
    let tickSeparation = 0;
    // Keeps track of how many steps to multiply the slider's step by.
    let stepCounter = 1;

    while (tickSeparation < MIN_AUTO_TICK_SEPARATION) {
      // Multiplying the counter and step together determines which step we want to use. This starts
      // at the first step and moves to second, then third, etc. until we find a good distance.
      let tickValue = (this.step * stepCounter) + this.min;

      // The percentage of the step on the slider is needed in order to calculate the pixel offset
      // from the beginning of the slider. This offset is the tick separation.
      let tickPercentage = this.calculatePercentage(tickValue);
      tickSeparation = this._sliderDimensions.width * tickPercentage;
      stepCounter++;
    }

    // Once a suitable separation for the ticks is found, draw them on the slider.
    this._renderer.drawTicks(tickSeparation);
  }

  /**
   * Calculates the separation of tick marks by finding the pixel value of the tickInterval.
   */
  private _updateTickSeparationFromInterval() {
    // Force tickInterval to be a number so it can be used in calculations.
    let interval: number = <number> this._tickInterval;
    // Calculate the first value a tick will be located at by getting the step at which the interval
    // lands and adding that to the min.
    let tickValue = (this.step * interval) + this.min;

    // The percentage of the step on the slider is needed in order to calculate the pixel offset
    // from the beginning of the slider. This offset is the tick separation.
    let tickPercentage = this.calculatePercentage(tickValue);
    this._renderer.drawTicks(this._sliderDimensions.width * tickPercentage);
  }

  /**
   * Calculates the percentage of the slider that a value is.
   */
  calculatePercentage(value: number) {
    return (value - this.min) / (this.max - this.min);
  }

  /**
   * Calculates the value a percentage of the slider corresponds to.
   */
  calculateValue(percentage: number) {
    return this.min + (percentage * (this.max - this.min));
  }

  /**
   * Return a number between two numbers.
   */
  clamp(value: number, min = 0, max = 1) {
    return Math.max(min, Math.min(value, max));
  }
}

/**
 * Renderer class in order to keep all dom manipulation in one place and outside of the main class.
 */
export class SliderRenderer {
  private _sliderElement: HTMLElement;

  constructor(elementRef: ElementRef) {
    this._sliderElement = elementRef.nativeElement;
  }

  /**
   * Get the bounding client rect of the slider track element.
   * The track is used rather than the native element to ignore the extra space that the thumb can
   * take up.
   */
  getSliderDimensions() {
    let trackElement = this._sliderElement.querySelector('.md-slider-track');
    return trackElement.getBoundingClientRect();
  }

  /**
   * Update the physical position of the thumb and fill track on the slider.
   */
  updateThumbAndFillPosition(percent: number, width: number) {
    // A container element that is used to avoid overwriting the transform on the thumb itself.
    let thumbPositionElement =
        <HTMLElement>this._sliderElement.querySelector('.md-slider-thumb-position');
    let fillTrackElement = <HTMLElement>this._sliderElement.querySelector('.md-slider-track-fill');

    let position = percent * width;

    fillTrackElement.style.width = `${position}px`;
    applyCssTransform(thumbPositionElement, `translateX(${position}px)`);
  }

  /**
   * Focuses the native element.
   * Currently only used to allow a blur event to fire but will be used with keyboard input later.
   */
  addFocus() {
    this._sliderElement.focus();
  }

  /**
   * Draws ticks onto the tick container.
   */
  drawTicks(tickSeparation: number) {
    let tickContainer = <HTMLElement>this._sliderElement.querySelector('.md-slider-tick-container');
    let tickContainerWidth = tickContainer.getBoundingClientRect().width;
    // An extra element for the last tick is needed because the linear gradient cannot be told to
    // always draw a tick at the end of the gradient. To get around this, there is a second
    // container for ticks that has a single tick mark on the very right edge.
    let lastTickContainer =
        <HTMLElement>this._sliderElement.querySelector('.md-slider-last-tick-container');
    // Subtract 1 from the tick separation to center the tick.
    // TODO: Evaluate the rendering performance of using repeating background gradients.
    tickContainer.style.background = `repeating-linear-gradient(to right, #000000, #000000 2px,
    transparent 2px, transparent ${tickSeparation - 1}px)`;
    // Add a tick to the very end by starting on the right side and adding a 2px black line.
    lastTickContainer.style.background = `linear-gradient(to left, #000000, #000000 2px,
    transparent 2px, transparent)`;

    // If the second to last tick is too close (a separation of less than half the normal
    // separation), don't show it by decreasing the width of the tick container element.
    if (tickContainerWidth % tickSeparation < (tickSeparation / 2)) {
      tickContainer.style.width = tickContainerWidth - tickSeparation + 'px';
    }
  }
}

export const MD_SLIDER_DIRECTIVES = [MdSlider];


@NgModule({
  exports: MD_SLIDER_DIRECTIVES,
  declarations: MD_SLIDER_DIRECTIVES,
  providers: [
    {provide: HAMMER_GESTURE_CONFIG, useClass: MdGestureConfig},
  ],
})
export class MdSliderModule { }

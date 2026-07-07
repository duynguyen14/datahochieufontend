import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  inject,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import {
  LayoutLmItem,
  PassportRecordDetail,
  SelectOption
} from '../../core/models/passport-record.model';

type FieldType = 'text' | 'select' | 'date';

const FIELD_TAG_BY_KEY: Record<string, string> = {
  passport_type: 'PASSPORT_TYPE',
  issuing_country: 'ISSUING_COUNTRY',
  surname: 'SURNAME',
  given_names: 'GIVEN_NAMES',
  passport_number: 'PASSPORT_NUMBER',
  sex: 'SEX',
  date_of_birth: 'DOB',
  place_of_birth: 'POB',
  nationality_current: 'NATIONALITY_CURRENT',
  nationality_at_birth: 'NATIONALITY_AT_BIRTH',
  date_of_issue: 'DATE_OF_ISSUE',
  date_of_expiry: 'DATE_OF_EXPIRY',
  issuing_authority: 'PLACE_OF_ISSUE',
  personal_number: 'PERSONAL_NUMBER'
};

interface ReviewFieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  uppercase?: boolean;
  options?: SelectOption[];
}

interface AssignedLayoutLmSummary {
  fieldKey: string;
  fieldLabel: string;
  text: string;
  itemIds: number[];
}

@Component({
  selector: 'app-record-review-modal',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './record-review-modal.component.html',
  styleUrl: './record-review-modal.component.scss'
})
export class RecordReviewModalComponent implements OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('overlayImage') overlayImage?: ElementRef<HTMLImageElement>;
  @ViewChild('imageViewport') imageViewport?: ElementRef<HTMLDivElement>;
  @ViewChild('editorPanel') editorPanel?: ElementRef<HTMLElement>;

  @Input({ required: true }) visible = false;
  @Input({ required: true }) loading = false;
  @Input({ required: true }) saving = false;
  @Input({ required: true }) overlayLoading = false;
  @Input() record: PassportRecordDetail | null = null;
  @Input() layoutLmItems: LayoutLmItem[] = [];
  @Input() imageUrl = '';
  @Input() form!: FormGroup;
  @Input() countryOptions: SelectOption[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() saveAndNext = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() layoutLmItemsChange = new EventEmitter<LayoutLmItem[]>();

  readonly passportTypeOptions: SelectOption[] = [
    { value: 'P', label: 'P - Pho thong' },
    { value: 'PO', label: 'PO - Cong vu' },
    { value: 'PD', label: 'PD - Ngoai giao' }
  ];

  readonly sexOptions: SelectOption[] = [
    { value: 'M', label: 'M - Nam' },
    { value: 'F', label: 'F - Nu' },
    { value: 'X', label: 'X - Khac / Khong xac dinh' }
  ];

  readonly fieldDefinitions = [
    { key: 'passport_type', label: 'Loai ho chieu', type: 'select', required: true, options: this.passportTypeOptions },
    { key: 'issuing_country', label: 'Quoc gia cap', type: 'select', required: true },
    { key: 'surname', label: 'Ho', type: 'text', uppercase: true },
    { key: 'given_names', label: 'Ten dem va ten', type: 'text', uppercase: true },
    { key: 'passport_number', label: 'So ho chieu', type: 'text', required: true, uppercase: true },
    { key: 'sex', label: 'Gioi tinh', type: 'select', required: true, options: this.sexOptions },
    { key: 'date_of_birth', label: 'Ngay sinh', type: 'date', required: true },
    { key: 'place_of_birth', label: 'Noi sinh', type: 'text', uppercase: true },
    { key: 'nationality_current', label: 'Quoc tich hien tai', type: 'select', required: true },
    { key: 'nationality_at_birth', label: 'Quoc tich goc', type: 'select' },
    { key: 'date_of_issue', label: 'Ngay cap', type: 'date', required: true },
    { key: 'date_of_expiry', label: 'Ngay het han', type: 'date', required: true },
    { key: 'issuing_authority', label: 'Noi cap / Co quan cap', type: 'text', uppercase: true },
    { key: 'personal_number', label: 'Ma ca nhan', type: 'text', uppercase: true }
  ] satisfies ReviewFieldDefinition[];

  readonly layoutLmTagDefinitions = this.fieldDefinitions.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
    uppercase: field.uppercase ?? false,
    tag: FIELD_TAG_BY_KEY[field.key]
  }));

  displayedImageWidth = 0;
  displayedImageHeight = 0;
  baseImageWidth = 0;
  baseImageHeight = 0;
  imageZoom = 1;
  imageRotation = 0;
  copiedWordText = '';
  selectedLayoutLmItemId: number | null = null;
  private originalBodyOverflow = '';
  private resizeObserver?: ResizeObserver;
  private copiedWordTimeoutId: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      this.updateBodyScrollLock(this.visible);
      if (this.visible) {
        this.resetViewportState();
      }
    }

    if (this.visible && changes['record']) {
      this.selectedLayoutLmItemId = null;
      this.imageZoom = 1;
      this.imageRotation = 0;
      this.resetViewportState();
    }

    if (
      changes['layoutLmItems']
      && this.selectedLayoutLmItemId !== null
      && !this.layoutLmItems.some((item) => item.id === this.selectedLayoutLmItemId)
    ) {
      this.selectedLayoutLmItemId = null;
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.copiedWordTimeoutId) {
      clearTimeout(this.copiedWordTimeoutId);
    }
    this.updateBodyScrollLock(false);
  }

  onImageLoaded(): void {
    this.imageZoom = 1;
    this.syncDisplayedImageSize();
    this.observeViewportResize();
  }

  get zoomPercentage(): number {
    return Math.round(this.imageZoom * 100);
  }

  get imageRotationDegrees(): number {
    return ((this.imageRotation % 360) + 360) % 360;
  }

  get canvasWidth(): number {
    return this.isQuarterTurn() ? this.displayedImageHeight : this.displayedImageWidth;
  }

  get canvasHeight(): number {
    return this.isQuarterTurn() ? this.displayedImageWidth : this.displayedImageHeight;
  }

  get imageRotationTransform(): string {
    return `translate(-50%, -50%) rotate(${this.imageRotationDegrees}deg)`;
  }

  onImageViewportWheel(event: WheelEvent): void {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();

    const viewport = this.imageViewport?.nativeElement;
    if (!viewport || !this.baseImageWidth || !this.baseImageHeight) {
      return;
    }

    const previousZoom = this.imageZoom;
    const zoomStep = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = Math.min(4, Math.max(1, previousZoom * zoomStep));
    if (Math.abs(nextZoom - previousZoom) < 0.001) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const pointerOffsetX = event.clientX - viewportRect.left;
    const pointerOffsetY = event.clientY - viewportRect.top;
    const anchorX = viewport.scrollLeft + pointerOffsetX;
    const anchorY = viewport.scrollTop + pointerOffsetY;
    const zoomRatio = nextZoom / previousZoom;

    this.imageZoom = nextZoom;
    this.syncDisplayedImageSize();
    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, anchorX * zoomRatio - pointerOffsetX);
      viewport.scrollTop = Math.max(0, anchorY * zoomRatio - pointerOffsetY);
    });
  }

  rotateImageLeft(): void {
    this.rotateImage(-90);
  }

  rotateImageRight(): void {
    this.rotateImage(90);
  }

  getLayoutLmItemStyles(item: LayoutLmItem, index: number): Record<string, string> {
    if (!this.record || !this.record.layoutlm_image_width || !this.record.layoutlm_image_height) {
      return {};
    }

    return {
      left: `${(item.bbox.left / this.record.layoutlm_image_width) * 100}%`,
      top: `${(item.bbox.top / this.record.layoutlm_image_height) * 100}%`,
      width: `${(item.bbox.width / this.record.layoutlm_image_width) * 100}%`,
      height: `${(item.bbox.height / this.record.layoutlm_image_height) * 100}%`,
      zIndex: `${index + 1}`
    };
  }

  getLayoutLmItemClasses(item: LayoutLmItem): Record<string, boolean> {
    return {
      'is-selected': item.id === this.selectedLayoutLmItemId,
      'is-assigned': item.label !== 'O',
      'is-unassigned': item.label === 'O'
    };
  }

  getFieldOptions(field: ReviewFieldDefinition): SelectOption[] {
    if (field.key === 'issuing_country' || field.key === 'nationality_current' || field.key === 'nationality_at_birth') {
      return this.countryOptions;
    }

    return field.options ?? [];
  }

  onTextInput(field: ReviewFieldDefinition): void {
    if (!field.uppercase) {
      return;
    }

    const control = this.form.get(field.key);
    const currentValue = String(control?.value ?? '');
    const uppercaseValue = currentValue.toUpperCase();

    if (control && currentValue !== uppercaseValue) {
      control.setValue(uppercaseValue, { emitEvent: false });
    }
  }

  isFieldInvalid(field: ReviewFieldDefinition): boolean {
    const control = this.form.get(field.key);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  get missingRequiredLabels(): string[] {
    return this.fieldDefinitions
      .filter((field) => field.required && this.form.get(field.key)?.invalid)
      .map((field) => field.label);
  }

  get showValidationSummary(): boolean {
    return this.form.touched && this.missingRequiredLabels.length > 0;
  }

  get reviewedJsonPreview(): string {
    if (!this.record || !this.form) {
      return '{}';
    }

    const normalizedGtParse = this.fieldDefinitions.reduce<Record<string, string>>((accumulator, field) => {
      const controlValue = String(this.form.get(field.key)?.value ?? '');
      accumulator[field.key] = this.normalizeValueForOutput(field, controlValue);
      return accumulator;
    }, {});

    return JSON.stringify(
      {
        file_name: this.record.image_name,
        ground_truth: JSON.stringify(
          {
            gt_parse: normalizedGtParse
          }
        )
      },
      null,
      2
    );
  }

  get selectedLayoutLmItem(): LayoutLmItem | null {
    if (this.selectedLayoutLmItemId === null) {
      return null;
    }

    return this.layoutLmItems.find((item) => item.id === this.selectedLayoutLmItemId) ?? null;
  }

  get assignedLayoutLmSummaries(): AssignedLayoutLmSummary[] {
    return this.layoutLmTagDefinitions
      .map((definition) => {
        const items = this.getItemsForField(this.layoutLmItems, definition.key);
        if (items.length === 0) {
          return null;
        }

        return {
          fieldKey: definition.key,
          fieldLabel: definition.label,
          text: this.joinFieldTexts(items),
          itemIds: items.map((item) => item.id)
        };
      })
      .filter((summary): summary is AssignedLayoutLmSummary => summary !== null);
  }

  selectLayoutLmItem(itemId: number): void {
    this.selectedLayoutLmItemId = itemId;
  }

  assignSelectedItemToField(fieldKey: string): void {
    if (this.selectedLayoutLmItemId === null) {
      return;
    }

    const tag = FIELD_TAG_BY_KEY[fieldKey];
    if (!tag) {
      return;
    }

    const selectedItem = this.layoutLmItems.find((item) => item.id === this.selectedLayoutLmItemId);
    if (!selectedItem) {
      return;
    }

    const previousFieldKey = this.getFieldKeyFromLabel(selectedItem.label);
    const updatedItems = this.relabelAssignedFields(
      this.layoutLmItems.map((item) =>
        item.id === this.selectedLayoutLmItemId
          ? { ...item, label: `I-${tag}` }
          : { ...item }
      )
    );

    this.layoutLmItemsChange.emit(this.cloneLayoutLmItems(updatedItems));

    if (previousFieldKey) {
      this.autofillFieldFromItems(previousFieldKey, updatedItems);
    }
    this.autofillFieldFromItems(fieldKey, updatedItems);
  }

  clearSelectedItemLabel(): void {
    if (this.selectedLayoutLmItemId === null) {
      return;
    }

    const selectedItem = this.layoutLmItems.find((item) => item.id === this.selectedLayoutLmItemId);
    const previousFieldKey = selectedItem ? this.getFieldKeyFromLabel(selectedItem.label) : null;

    const updatedItems = this.relabelAssignedFields(
      this.layoutLmItems.map((item) =>
        item.id === this.selectedLayoutLmItemId
          ? { ...item, label: 'O' }
          : { ...item }
      )
    );

    this.layoutLmItemsChange.emit(this.cloneLayoutLmItems(updatedItems));
    if (previousFieldKey) {
      this.autofillFieldFromItems(previousFieldKey, updatedItems);
    }
  }

  clearAllLayoutLmLabels(): void {
    const updatedItems = this.layoutLmItems.map((item) => ({
      ...item,
      label: 'O'
    }));

    this.layoutLmItemsChange.emit(this.cloneLayoutLmItems(updatedItems));
    this.selectedLayoutLmItemId = null;
    this.clearAutofillableFields();
  }

  focusAssignedItem(itemIds: number[]): void {
    this.selectedLayoutLmItemId = itemIds[0] ?? null;
  }

  isTagActiveForSelectedItem(fieldKey: string): boolean {
    const selectedItem = this.selectedLayoutLmItem;
    if (!selectedItem) {
      return false;
    }

    return this.getFieldKeyFromLabel(selectedItem.label) === fieldKey;
  }

  getShortLabel(label: string): string {
    if (!label || label === 'O') {
      return '';
    }

    return label.replace(/^B-/, '').replace(/^I-/, '');
  }

  async copyLayoutLmItemText(item: LayoutLmItem, event: MouseEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const textToCopy = item.text.trim();
    if (!textToCopy) {
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      this.copiedWordText = textToCopy;
      this.cdr.detectChanges();

      if (this.copiedWordTimeoutId) {
        clearTimeout(this.copiedWordTimeoutId);
      }

      this.copiedWordTimeoutId = setTimeout(() => {
        this.copiedWordText = '';
        this.cdr.detectChanges();
      }, 2200);
    } catch {
      this.copiedWordText = 'Khong copy duoc';
      this.cdr.detectChanges();
    }
  }

  private autofillFieldFromItems(fieldKey: string, items: LayoutLmItem[]): void {
    const definition = this.fieldDefinitions.find((field) => field.key === fieldKey);
    if (!definition) {
      return;
    }

    const control = this.form.get(fieldKey);
    if (!control) {
      return;
    }

    const fieldItems = this.getItemsForField(items, fieldKey);
    const rawJoinedValue = this.joinFieldTexts(fieldItems);
    if (!rawJoinedValue) {
      return;
    }

    let nextValue = rawJoinedValue;
    if (definition.type === 'select') {
      nextValue = this.resolveSelectValue(definition, rawJoinedValue);
      if (!nextValue) {
        return;
      }
    } else if (definition.type === 'date') {
      nextValue = this.normalizeDateInputValue(rawJoinedValue);
    } else if (definition.uppercase) {
      nextValue = rawJoinedValue.toUpperCase();
    }

    control.setValue(nextValue);
    control.markAsDirty();
    control.markAsTouched();
  }

  private joinFieldTexts(items: LayoutLmItem[]): string {
    return this.sortItemsByReadingOrder(items)
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  private sortItemsByReadingOrder(items: LayoutLmItem[]): LayoutLmItem[] {
    return [...items].sort((leftItem, rightItem) => {
      const topDiff = leftItem.bbox.top - rightItem.bbox.top;
      if (topDiff !== 0) {
        return topDiff;
      }

      return leftItem.bbox.left - rightItem.bbox.left;
    });
  }

  private getItemsForField(items: LayoutLmItem[], fieldKey: string): LayoutLmItem[] {
    const tag = FIELD_TAG_BY_KEY[fieldKey];
    if (!tag) {
      return [];
    }

    return this.sortItemsByReadingOrder(
      items.filter((item) => item.label === `B-${tag}` || item.label === `I-${tag}`)
    );
  }

  private getFieldKeyFromLabel(label: string): string | null {
    const normalizedLabel = label.replace(/^B-/, '').replace(/^I-/, '');
    if (!normalizedLabel || normalizedLabel === 'O') {
      return null;
    }

    const matchedEntry = Object.entries(FIELD_TAG_BY_KEY).find(([, tag]) => tag === normalizedLabel);
    return matchedEntry?.[0] ?? null;
  }

  private relabelAssignedFields(items: LayoutLmItem[]): LayoutLmItem[] {
    let nextItems = this.cloneLayoutLmItems(items);

    for (const definition of this.layoutLmTagDefinitions) {
      const tag = definition.tag;
      const fieldItems = this.sortItemsByReadingOrder(
        nextItems.filter((item) => item.label === `B-${tag}` || item.label === `I-${tag}`)
      );

      if (fieldItems.length === 0) {
        continue;
      }

      const normalizedLabels = new Map<number, string>();
      fieldItems.forEach((item, index) => {
        normalizedLabels.set(item.id, `${index === 0 ? 'B' : 'I'}-${tag}`);
      });

      nextItems = nextItems.map((item) => {
        const nextLabel = normalizedLabels.get(item.id);
        if (!nextLabel) {
          return item;
        }

        return { ...item, label: nextLabel };
      });
    }

    return nextItems;
  }

  private normalizeDateInputValue(value: string): string {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return '';
    }

    const isoMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return trimmedValue;
    }

    const dayFirstMatch = trimmedValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
    if (!dayFirstMatch) {
      return trimmedValue;
    }

    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const yearToken = dayFirstMatch[3];
    const year = yearToken.length === 2
      ? (Number(yearToken) >= 69 ? 1900 + Number(yearToken) : 2000 + Number(yearToken))
      : Number(yearToken);

    if (!day || !month || !year) {
      return trimmedValue;
    }

    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  private normalizeValueForOutput(field: ReviewFieldDefinition, value: string): string {
    if (field.type === 'date') {
      return this.normalizeDateInputValue(value);
    }

    if (field.uppercase) {
      return value.toUpperCase().trim();
    }

    return value.trim();
  }
  private resolveSelectValue(field: ReviewFieldDefinition, rawValue: string): string {
    const normalizedRawValue = rawValue.trim().toUpperCase().replace(/\s+/g, '');
    if (!normalizedRawValue) {
      return '';
    }

    if (field.key === 'passport_type') {
      if (normalizedRawValue === 'PO' || normalizedRawValue.startsWith('PO')) {
        return 'PO';
      }
      if (normalizedRawValue === 'PD' || normalizedRawValue.startsWith('PD')) {
        return 'PD';
      }
      if (normalizedRawValue === 'P' || normalizedRawValue.startsWith('P<') || normalizedRawValue.startsWith('P')) {
        return 'P';
      }
    }

    const options = this.getFieldOptions(field);
    const matchedOption = options.find((option) => option.value.trim().toUpperCase() === normalizedRawValue);
    return matchedOption?.value ?? '';
  }

  private cloneLayoutLmItems(items: LayoutLmItem[]): LayoutLmItem[] {
    return items.map((item) => ({
      ...item,
      bbox: { ...item.bbox }
    }));
  }

  private clearAutofillableFields(): void {
    for (const field of this.fieldDefinitions) {
      const control = this.form.get(field.key);
      if (!control) {
        continue;
      }

      control.setValue('');
      control.markAsDirty();
      control.markAsTouched();
    }
  }

  private resetViewportState(): void {
    setTimeout(() => {
      this.editorPanel?.nativeElement.scrollTo({ top: 0, behavior: 'auto' });
      this.imageViewport?.nativeElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  private rotateImage(deltaDegrees: number): void {
    this.imageRotation = (this.imageRotation + deltaDegrees + 360) % 360;
    this.syncDisplayedImageSize();
    this.resetViewportState();
  }

  private observeViewportResize(): void {
    const viewportElement = this.imageViewport?.nativeElement;
    if (!viewportElement || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.syncDisplayedImageSize();
    });
    this.resizeObserver.observe(viewportElement);
  }

  private syncDisplayedImageSize(): void {
    const imageElement = this.overlayImage?.nativeElement;
    const viewportElement = this.imageViewport?.nativeElement;
    if (!imageElement || !viewportElement) {
      return;
    }

    const naturalWidth = imageElement.naturalWidth;
    const naturalHeight = imageElement.naturalHeight;
    const viewportWidth = viewportElement.clientWidth;
    const viewportHeight = viewportElement.clientHeight;
    if (!naturalWidth || !naturalHeight || !viewportWidth || !viewportHeight) {
      return;
    }

    const rotatedNaturalWidth = this.isQuarterTurn() ? naturalHeight : naturalWidth;
    const rotatedNaturalHeight = this.isQuarterTurn() ? naturalWidth : naturalHeight;
    const fitScale = Math.min(viewportWidth / rotatedNaturalWidth, viewportHeight / rotatedNaturalHeight);
    this.baseImageWidth = Math.max(1, Math.round(naturalWidth * fitScale));
    this.baseImageHeight = Math.max(1, Math.round(naturalHeight * fitScale));

    const nextWidth = Math.max(1, Math.round(this.baseImageWidth * this.imageZoom));
    const nextHeight = Math.max(1, Math.round(this.baseImageHeight * this.imageZoom));

    if (
      nextWidth === this.displayedImageWidth &&
      nextHeight === this.displayedImageHeight
    ) {
      return;
    }

    this.displayedImageWidth = nextWidth;
    this.displayedImageHeight = nextHeight;
    this.cdr.detectChanges();
  }

  private updateBodyScrollLock(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }

    if (locked) {
      this.originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return;
    }

    document.body.style.overflow = this.originalBodyOverflow;
  }

  private isQuarterTurn(): boolean {
    return this.imageRotationDegrees === 90 || this.imageRotationDegrees === 270;
  }
}

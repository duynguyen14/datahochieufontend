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
    OcrFieldMatch,
    OcrOverlayData,
    OcrOverlayWord,
    PassportEditableFields,
    PassportPortraitData,
    PassportRecordDetail,
    SelectOption
} from '../../core/models/passport-record.model';

type FieldType = 'text' | 'select' | 'date';
type ReviewFieldKey = keyof PassportEditableFields;

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
    key: ReviewFieldKey;
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

const AUTOFILL_TEXT_FIELD_KEYS = new Set<string>([
    'place_of_birth',
    'issuing_authority'
]);

@Component({
    selector: 'app-record-review-modal',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './record-review-modal.component.html',
    styleUrl: './record-review-modal.component.scss'
})
export class RecordReviewModalComponent implements OnChanges, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly overlayMeasureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

    @ViewChild('overlayImage') overlayImage?: ElementRef<HTMLImageElement>;
    @ViewChild('imageViewport') imageViewport?: ElementRef<HTMLDivElement>;
    @ViewChild('editorPanel') editorPanel?: ElementRef<HTMLElement>;

    @Input({ required: true }) visible = false;
    @Input({ required: true }) loading = false;
    @Input({ required: true }) saving = false;
    @Input({ required: true }) overlayLoading = false;
    @Input() record: PassportRecordDetail | null = null;
    @Input() layoutLmItems: LayoutLmItem[] = [];
    @Input() ocrOverlay: OcrOverlayData | null = null;
    @Input() portrait: PassportPortraitData | null = null;
    @Input() portraitLoading = false;
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
        // { key: 'nationality_current', label: 'Quoc tich hien tai', type: 'select', required: true },
        // { key: 'nationality_at_birth', label: 'Quoc tich goc', type: 'select' },
        { key: 'date_of_issue', label: 'Ngay cap', type: 'date', required: true },
        { key: 'date_of_expiry', label: 'Ngay het han', type: 'date', required: true },
        { key: 'issuing_authority', label: 'Noi cap / Co quan cap', type: 'text', uppercase: true },
        // { key: 'personal_number', label: 'Ma ca nhan', type: 'text', uppercase: true }
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
    selectedOcrWordId: string | null = null;
    selectedOcrLineId: string | null = null;
    activeMatchedFieldKey: ReviewFieldKey | null = null;
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
            this.selectedOcrWordId = null;
            this.selectedOcrLineId = null;
            this.activeMatchedFieldKey = null;
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

        if (
            changes['ocrOverlay']
            && this.activeMatchedFieldKey
            && !this.getFieldMatch(this.activeMatchedFieldKey)?.matched
        ) {
            this.activeMatchedFieldKey = null;
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

    get sortedOcrWords(): OcrOverlayWord[] {
        return [...(this.ocrOverlay?.words ?? [])].sort((leftWord, rightWord) => leftWord.order - rightWord.order);
    }

    get hasOcrOverlay(): boolean {
        return this.sortedOcrWords.length > 0;
    }

    get activeFieldMatch(): OcrFieldMatch | null {
        return this.activeMatchedFieldKey ? this.getFieldMatch(this.activeMatchedFieldKey) : null;
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

    getOcrWordStyles(word: OcrOverlayWord): Record<string, string> {
        const boxStyles = this.getOcrWordBoxStyles(word);
        if (!Object.keys(boxStyles).length) {
            return {};
        }

        const widthPx = Number.parseFloat(boxStyles['width'] || '0');
        const heightPx = Number.parseFloat(boxStyles['height'] || '0');
        const fontSizePx = this.resolveOverlayFontSize(heightPx);
        const scaleX = this.measureOverlayScaleX(word.text, widthPx, fontSizePx);
        const transforms: string[] = [];
        if (Math.abs(word.rotation) > 0.01) {
            transforms.push(`rotate(${word.rotation}deg)`);
        }
        if (Math.abs(scaleX - 1) > 0.01) {
            transforms.push(`scaleX(${scaleX})`);
        }

        return {
            ...boxStyles,
            zIndex: `${word.order}`,
            fontSize: `${fontSizePx}px`,
            lineHeight: `${Math.max(1, heightPx)}px`,
            transform: transforms.join(' ') || 'none',
            transformOrigin: 'top left'
        };
    }

    getOcrWordBoxStyles(word: OcrOverlayWord): Record<string, string> {
        if (!this.ocrOverlay || !this.displayedImageWidth || !this.displayedImageHeight) {
            return {};
        }

        const leftPx = (word.boundingBox.left / 100) * this.displayedImageWidth;
        const topPx = (word.boundingBox.top / 100) * this.displayedImageHeight;
        const widthPx = (word.boundingBox.width / 100) * this.displayedImageWidth;
        const heightPx = (word.boundingBox.height / 100) * this.displayedImageHeight;

        return {
            left: `${leftPx}px`,
            top: `${topPx}px`,
            width: `${Math.max(1, widthPx)}px`,
            height: `${Math.max(1, heightPx)}px`,
        };
    }

    getOcrWordClasses(word: OcrOverlayWord): Record<string, boolean> {
        return {
            'is-line-selected': word.line_id === this.selectedOcrLineId && this.selectedOcrLineId !== null,
            'is-linked-match': this.isWordLinkedToActiveField(word),
        };
    }

    selectOcrWord(word: OcrOverlayWord): void {
        this.selectedOcrWordId = word.id;
        this.selectedOcrLineId = word.line_id;
        this.activeMatchedFieldKey = this.getBestFieldKeyForWord(word);
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

    onFieldFocus(fieldKey: ReviewFieldKey): void {
        this.activeMatchedFieldKey = fieldKey;
    }

    isFieldActive(fieldKey: ReviewFieldKey): boolean {
        return this.activeMatchedFieldKey === fieldKey;
    }

    hasMatchedField(fieldKey: ReviewFieldKey): boolean {
        return !!this.getFieldMatch(fieldKey)?.matched;
    }

    getFieldMatch(fieldKey: ReviewFieldKey): OcrFieldMatch | null {
        const match = this.ocrOverlay?.field_matches?.[fieldKey];
        return match ?? null;
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
        return this.layoutLmTagDefinitions.reduce<AssignedLayoutLmSummary[]>(
            (summaries, definition) => {
                const items = this.getItemsForField(this.layoutLmItems, definition.key);
                if (items.length === 0) {
                    return summaries;
                }

                summaries.push({
                    fieldKey: definition.key,
                    fieldLabel: definition.label,
                    text: this.joinFieldTexts(items),
                    itemIds: items.map((item) => item.id)
                });
                return summaries;
            },
            []
        );
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

        if (previousFieldKey && previousFieldKey !== fieldKey) {
            this.clearFieldValueIfNoAssignedItems(previousFieldKey, updatedItems);
        }
        this.autofillFieldFromSelectedItem(fieldKey, selectedItem.text);
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
            this.clearFieldValueIfNoAssignedItems(previousFieldKey, updatedItems);
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

    async copyOcrWordText(word: OcrOverlayWord, event: MouseEvent): Promise<void> {
        event.stopPropagation();

        this.selectOcrWord(word);
        const textToCopy = word.text.trim();
        if (!textToCopy) {
            return;
        }

        await this.copyTextToClipboard(textToCopy);
        this.cdr.detectChanges();
    }

    async copyLayoutLmItemText(item: LayoutLmItem, event: MouseEvent): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        const textToCopy = item.text.trim();
        if (!textToCopy) {
            return;
        }

        await this.copyTextToClipboard(textToCopy);
    }

    private async copyTextToClipboard(textToCopy: string): Promise<void> {
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

    private getBestFieldKeyForWord(word: OcrOverlayWord): ReviewFieldKey | null {
        const fieldMatches = this.ocrOverlay?.field_matches;
        if (!fieldMatches) {
            return null;
        }

        let bestFieldKey: ReviewFieldKey | null = null;
        let bestScore = 0;

        for (const rawFieldKey of Object.keys(fieldMatches)) {
            const fieldKey = rawFieldKey as ReviewFieldKey;
            const match = fieldMatches[fieldKey];
            if (!match?.matched) {
                continue;
            }

            const directWordMatch = match.word_ids.includes(word.id);
            const directLineMatch = !directWordMatch && match.line_ids.includes(word.line_id);
            if (!directWordMatch && !directLineMatch) {
                continue;
            }

            const adjustedScore = directWordMatch ? match.score + 0.01 : match.score;
            if (adjustedScore > bestScore) {
                bestScore = adjustedScore;
                bestFieldKey = fieldKey;
            }
        }

        return bestFieldKey;
    }

    private isWordLinkedToActiveField(word: OcrOverlayWord): boolean {
        const activeMatch = this.activeFieldMatch;
        if (!activeMatch?.matched) {
            return false;
        }

        return activeMatch.word_ids.includes(word.id) || activeMatch.line_ids.includes(word.line_id);
    }


    private autofillFieldFromSelectedItem(fieldKey: string, rawValue: string): void {
        const definition = this.fieldDefinitions.find((field) => field.key === fieldKey);
        if (!definition) {
            return;
        }

        if (!AUTOFILL_TEXT_FIELD_KEYS.has(fieldKey)) {
            return;
        }

        const control = this.form.get(fieldKey);
        if (!control) {
            return;
        }

        const normalizedRawValue = rawValue.trim();
        if (!normalizedRawValue) {
            return;
        }

        let nextValue = normalizedRawValue;
        if (definition.type === 'select') {
            nextValue = this.resolveSelectValue(definition, normalizedRawValue);
            if (!nextValue) {
                return;
            }
        } else if (definition.uppercase) {
            nextValue = normalizedRawValue.toUpperCase();
        }

        control.setValue(nextValue);
        control.markAsDirty();
        control.markAsTouched();
    }

    private clearFieldValueIfNoAssignedItems(fieldKey: string, items: LayoutLmItem[]): void {
        const definition = this.fieldDefinitions.find((field) => field.key === fieldKey);
        const control = this.form.get(fieldKey);
        if (
            !definition
            || !control
            || !AUTOFILL_TEXT_FIELD_KEYS.has(fieldKey)
            || this.getItemsForField(items, fieldKey).length > 0
        ) {
            return;
        }

        control.setValue('');
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

    private resolveOverlayFontSize(heightPx: number): number {
        return Math.max(8, Math.min(heightPx, heightPx * 0.82));
    }

    private measureOverlayScaleX(text: string, targetWidthPx: number, fontSizePx: number): number {
        const normalizedText = text || ' ';
        if (!this.overlayMeasureCanvas || !targetWidthPx || !fontSizePx) {
            return 1;
        }

        const context = this.overlayMeasureCanvas.getContext('2d');
        if (!context) {
            return 1;
        }

        context.font = `${fontSizePx}px Arial, Helvetica, sans-serif`;
        const measuredWidth = context.measureText(normalizedText).width;
        if (!measuredWidth) {
            return 1;
        }

        const rawScale = targetWidthPx / measuredWidth;
        return Math.min(2.2, Math.max(0.3, rawScale));
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

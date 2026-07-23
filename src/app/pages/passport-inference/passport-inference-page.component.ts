import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import {
    OcrFieldMatch,
    OcrOverlayWord,
    PassportEditableFields,
    PassportFaceMatchData,
    PassportFaceMatchRequestPayload,
    PassportInferenceData,
    SelectOption
} from '../../core/models/passport-record.model';
import { PassportRecordsService } from '../../core/services/passport-records.service';

type InferenceFieldType = 'text' | 'select' | 'date';
type InferenceFieldKey = keyof PassportEditableFields;

interface InferenceFieldDefinition {
    key: InferenceFieldKey;
    label: string;
    type: InferenceFieldType;
    required?: boolean;
    uppercase?: boolean;
    options?: SelectOption[];
}

@Component({
    selector: 'app-passport-inference-page',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './passport-inference-page.component.html',
    styleUrl: './passport-inference-page.component.scss'
})
export class PassportInferencePageComponent implements OnDestroy {
    private readonly recordsService = inject(PassportRecordsService);
    private readonly formBuilder = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly overlayMeasureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

    @ViewChild('overlayImage') overlayImage?: ElementRef<HTMLImageElement>;
    @ViewChild('imageStage') imageStage?: ElementRef<HTMLDivElement>;

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

    countryOptions: SelectOption[] = [];
    inferenceResult: PassportInferenceData | null = null;
    faceMatchResult: PassportFaceMatchData | null = null;
    selectedFileName = '';
    selectedFaceFileName = '';
    isInferring = false;
    isVerifyingFace = false;
    errorMessage = '';
    faceMatchErrorMessage = '';
    copiedWordText = '';
    copiedJsonMessage = '';
    displayedImageWidth = 0;
    displayedImageHeight = 0;
    selectedOcrWordId: string | null = null;
    activeMatchedFieldKey: InferenceFieldKey | null = null;
    uploadedFaceBase64Payload = '';
    uploadedFacePreviewUrl = '';
    private resizeObserver?: ResizeObserver;
    private faceVerifyRequestId = 0;

    readonly form: FormGroup = this.buildForm();
    readonly fieldDefinitions: InferenceFieldDefinition[] = [
        { key: 'passport_type', label: 'Loai ho chieu', type: 'select', required: true, options: this.passportTypeOptions },
        { key: 'issuing_country', label: 'Quoc gia cap', type: 'select', required: true },
        { key: 'surname', label: 'Ho', type: 'text', uppercase: true },
        { key: 'given_names', label: 'Ten dem va ten', type: 'text', uppercase: true },
        { key: 'passport_number', label: 'So ho chieu', type: 'text', required: true, uppercase: true },
        { key: 'sex', label: 'Gioi tinh', type: 'select', required: true, options: this.sexOptions },
        { key: 'date_of_birth', label: 'Ngay sinh', type: 'date', required: true },
        { key: 'place_of_birth', label: 'Noi sinh', type: 'text', uppercase: true },
        { key: 'date_of_issue', label: 'Ngay cap', type: 'date', required: true },
        { key: 'date_of_expiry', label: 'Ngay het han', type: 'date', required: true },
        { key: 'issuing_authority', label: 'Noi cap / Co quan cap', type: 'text', uppercase: true }
    ];

    ngOnInit(): void {
        this.loadCountryOptions();
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
    }

    get sortedOcrWords(): OcrOverlayWord[] {
        return [...(this.inferenceResult?.overlay.words ?? [])].sort((leftWord, rightWord) => leftWord.order - rightWord.order);
    }

    get hasOverlay(): boolean {
        return this.sortedOcrWords.length > 0;
    }

    get activeFieldMatch(): OcrFieldMatch | null {
        return this.activeMatchedFieldKey ? this.getFieldMatch(this.activeMatchedFieldKey) : null;
    }

    get reviewedJsonPreview(): string {
        const imageName = this.inferenceResult?.image_name || this.selectedFileName || 'passport_upload.jpg';
        const gtParse = this.normalizeEditableFieldsForPreview(this.form.getRawValue() as PassportEditableFields);
        return JSON.stringify(
            {
                file_name: imageName,
                ground_truth: JSON.stringify({ gt_parse: gtParse })
            },
            null,
            2
        );
    }

    get passportDisplayImageSrc(): string {
        return this.buildInlineImageSrc(
            this.inferenceResult?.image_content_type,
            this.inferenceResult?.image_base64,
            this.inferenceResult?.image_url || ''
        );
    }

    get passportFaceDisplayImageSrc(): string {
        return this.buildInlineImageSrc(
            this.inferenceResult?.face_image?.content_type,
            this.inferenceResult?.face_image?.base64
        );
    }

    get matchedPassportAlignedFaceSrc(): string {
        return this.buildInlineImageSrc(
            this.faceMatchResult?.passport_face?.aligned_face_content_type,
            this.faceMatchResult?.passport_face?.aligned_face_base64,
            this.passportFaceDisplayImageSrc
        );
    }

    get matchedUploadedAlignedFaceSrc(): string {
        return this.buildInlineImageSrc(
            this.faceMatchResult?.uploaded_face?.aligned_face_content_type,
            this.faceMatchResult?.uploaded_face?.aligned_face_base64,
            this.uploadedFacePreviewUrl
        );
    }

    get canVerifyFace(): boolean {
        return !!this.inferenceResult?.face_image?.detected && !!this.uploadedFaceBase64Payload;
    }

    get faceMatchStatusLabel(): string {
        const decision = this.faceMatchResult?.decision;
        if (decision === 'match') {
            return 'Khop';
        }
        if (decision === 'review') {
            return 'Can review';
        }
        if (decision === 'mismatch') {
            return 'Khong khop';
        }
        return 'Chua verify';
    }

    get faceMatchStatusClass(): string {
        const decision = this.faceMatchResult?.decision;
        if (decision === 'match') {
            return 'text-bg-success';
        }
        if (decision === 'review') {
            return 'text-bg-warning';
        }
        if (decision === 'mismatch') {
            return 'text-bg-danger';
        }
        return 'text-bg-secondary';
    }

    trackByWordId(_: number, word: OcrOverlayWord): string {
        return word.id;
    }

    onFileSelected(event: Event): void {
        const inputElement = event.target as HTMLInputElement | null;
        const file = inputElement?.files?.[0];
        if (!file) {
            return;
        }

        this.selectedFileName = file.name;
        this.runInference(file);
        inputElement.value = '';
    }

    async onFaceFileSelected(event: Event): Promise<void> {
        const inputElement = event.target as HTMLInputElement | null;
        const file = inputElement?.files?.[0];
        if (!file) {
            return;
        }

        try {
            const base64Payload = await this.readFileAsDataUrl(file);
            this.selectedFaceFileName = file.name;
            this.uploadedFaceBase64Payload = base64Payload;
            this.uploadedFacePreviewUrl = base64Payload;
            this.faceMatchErrorMessage = '';
            this.faceMatchResult = null;
            this.cdr.detectChanges();
            this.triggerFaceVerification();
        } catch {
            this.faceMatchErrorMessage = 'Khong doc duoc anh mat vua upload.';
            this.cdr.detectChanges();
        } finally {
            inputElement.value = '';
        }
    }

    clearFaceUpload(): void {
        this.selectedFaceFileName = '';
        this.uploadedFaceBase64Payload = '';
        this.uploadedFacePreviewUrl = '';
        this.faceMatchResult = null;
        this.faceMatchErrorMessage = '';
        this.isVerifyingFace = false;
        this.faceVerifyRequestId += 1;
        this.cdr.detectChanges();
    }

    clearResult(): void {
        this.inferenceResult = null;
        this.faceMatchResult = null;
        this.selectedFileName = '';
        this.selectedFaceFileName = '';
        this.uploadedFaceBase64Payload = '';
        this.uploadedFacePreviewUrl = '';
        this.errorMessage = '';
        this.faceMatchErrorMessage = '';
        this.copiedWordText = '';
        this.copiedJsonMessage = '';
        this.displayedImageWidth = 0;
        this.displayedImageHeight = 0;
        this.selectedOcrWordId = null;
        this.activeMatchedFieldKey = null;
        this.isInferring = false;
        this.isVerifyingFace = false;
        this.faceVerifyRequestId += 1;
        this.form.reset({
            passport_type: '',
            issuing_country: '',
            surname: '',
            given_names: '',
            passport_number: '',
            sex: '',
            date_of_birth: '',
            place_of_birth: '',
            nationality_current: '',
            nationality_at_birth: '',
            date_of_issue: '',
            date_of_expiry: '',
            issuing_authority: '',
            personal_number: ''
        });
        this.cdr.detectChanges();
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
        if (!this.displayedImageWidth || !this.displayedImageHeight) {
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
            'is-linked-match': this.isWordLinkedToActiveField(word),
        };
    }

    onOverlayImageLoaded(): void {
        this.syncOverlayImageSize();
        this.observeOverlayResize();
    }

    async copyOcrWordText(word: OcrOverlayWord, event: MouseEvent): Promise<void> {
        event.preventDefault();

        try {
            await navigator.clipboard.writeText(word.text);
            this.copiedWordText = word.text;
            this.cdr.detectChanges();

            setTimeout(() => {
                if (this.copiedWordText === word.text) {
                    this.copiedWordText = '';
                    this.cdr.detectChanges();
                }
            }, 1800);
        } catch {
            this.copiedWordText = 'Khong the copy tu dong';
            this.cdr.detectChanges();
        }
    }

    selectOcrWord(word: OcrOverlayWord): void {
        this.selectedOcrWordId = word.id;
        this.activeMatchedFieldKey = this.getBestFieldKeyForWord(word);
    }

    async copyReviewedJson(): Promise<void> {
        try {
            await navigator.clipboard.writeText(this.reviewedJsonPreview);
            this.copiedJsonMessage = 'Da copy JSON train Donut';
        } catch {
            this.copiedJsonMessage = 'Khong the copy JSON';
        }

        this.cdr.detectChanges();
        setTimeout(() => {
            this.copiedJsonMessage = '';
            this.cdr.detectChanges();
        }, 1800);
    }

    normalizeUppercaseField(fieldKey: InferenceFieldKey): void {
        const currentValue = String(this.form.get(fieldKey)?.value ?? '');
        if (!currentValue) {
            return;
        }

        this.form.get(fieldKey)?.setValue(currentValue.toUpperCase(), { emitEvent: false });
    }

    onFieldFocus(fieldKey: InferenceFieldKey): void {
        this.activeMatchedFieldKey = fieldKey;
    }

    isFieldActive(fieldKey: InferenceFieldKey): boolean {
        return this.activeMatchedFieldKey === fieldKey;
    }

    hasMatchedField(fieldKey: InferenceFieldKey): boolean {
        return !!this.getFieldMatch(fieldKey)?.matched;
    }

    getFieldMatch(fieldKey: InferenceFieldKey): OcrFieldMatch | null {
        const match = this.inferenceResult?.overlay.field_matches?.[fieldKey];
        return match ?? null;
    }

    triggerFaceVerification(): void {
        if (!this.uploadedFaceBase64Payload) {
            this.faceMatchErrorMessage = 'Chon them anh mat de so khop.';
            this.faceMatchResult = null;
            this.cdr.detectChanges();
            return;
        }

        const passportFace = this.inferenceResult?.face_image;
        if (!passportFace?.detected || !passportFace.base64) {
            this.faceMatchErrorMessage = 'Backend chua cat duoc anh mat tu passport nen chua the so khop.';
            this.faceMatchResult = null;
            this.cdr.detectChanges();
            return;
        }

        const payload: Omit<PassportFaceMatchRequestPayload, 'api_key'> = {
            passport_face_base64: this.buildInlineImageSrc(passportFace.content_type, passportFace.base64),
            passport_face_file_name: passportFace.file_name || 'passport_face.jpg',
            uploaded_face_base64: this.uploadedFaceBase64Payload,
            uploaded_face_file_name: this.selectedFaceFileName || 'uploaded_face.jpg'
        };

        const requestId = ++this.faceVerifyRequestId;
        this.isVerifyingFace = true;
        this.faceMatchErrorMessage = '';
        this.faceMatchResult = null;
        this.cdr.detectChanges();

        this.recordsService
            .verifyPassportFaceMatch(payload)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    if (requestId !== this.faceVerifyRequestId) {
                        return;
                    }

                    this.faceMatchResult = response.data;
                    this.isVerifyingFace = false;
                    this.faceMatchErrorMessage = '';
                    this.cdr.detectChanges();
                },
                error: (error) => {
                    if (requestId !== this.faceVerifyRequestId) {
                        return;
                    }

                    this.faceMatchResult = null;
                    this.isVerifyingFace = false;
                    this.faceMatchErrorMessage = error?.error?.detail || 'Khong verify duoc anh mat.';
                    this.cdr.detectChanges();
                }
            });
    }

    private runInference(file: File): void {
        this.isInferring = true;
        this.errorMessage = '';
        this.faceMatchErrorMessage = '';
        this.faceMatchResult = null;
        this.copiedWordText = '';
        this.copiedJsonMessage = '';

        this.recordsService
            .uploadPassportInference(file)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    this.inferenceResult = response.data;
                    this.selectedOcrWordId = null;
                    this.activeMatchedFieldKey = null;
                    this.patchForm(response.data.editable_fields);
                    this.isInferring = false;
                    this.cdr.detectChanges();
                    setTimeout(() => this.syncOverlayImageSize());

                    if (this.uploadedFaceBase64Payload) {
                        this.triggerFaceVerification();
                    }
                },
                error: (error) => {
                    this.inferenceResult = null;
                    this.faceMatchResult = null;
                    this.isInferring = false;
                    this.errorMessage = error?.error?.detail || 'Khong chay duoc PaddleOCR + Donut tren anh vua upload.';
                    this.cdr.detectChanges();
                }
            });
    }

    private patchForm(fields: PassportEditableFields): void {
        this.form.patchValue({
            passport_type: fields.passport_type || '',
            issuing_country: fields.issuing_country || '',
            surname: fields.surname || '',
            given_names: fields.given_names || '',
            passport_number: fields.passport_number || '',
            sex: fields.sex || '',
            date_of_birth: this.normalizeDateForForm(fields.date_of_birth),
            place_of_birth: fields.place_of_birth || '',
            nationality_current: fields.nationality_current || '',
            nationality_at_birth: fields.nationality_at_birth || '',
            date_of_issue: this.normalizeDateForForm(fields.date_of_issue),
            date_of_expiry: this.normalizeDateForForm(fields.date_of_expiry),
            issuing_authority: fields.issuing_authority || '',
            personal_number: fields.personal_number || ''
        });
    }

    private loadCountryOptions(): void {
        this.recordsService
            .getCountryOptions()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    this.countryOptions = response.items;
                    this.cdr.detectChanges();
                },
                error: () => {
                    this.errorMessage = 'Khong tai duoc danh muc quoc gia.';
                    this.cdr.detectChanges();
                }
            });
    }

    private buildForm(): FormGroup {
        return this.formBuilder.group({
            passport_type: ['', Validators.required],
            issuing_country: ['', Validators.required],
            surname: [''],
            given_names: [''],
            passport_number: ['', Validators.required],
            sex: ['', Validators.required],
            date_of_birth: ['', Validators.required],
            place_of_birth: [''],
            nationality_current: ['', Validators.required],
            nationality_at_birth: [''],
            date_of_issue: ['', Validators.required],
            date_of_expiry: ['', Validators.required],
            issuing_authority: [''],
            personal_number: ['']
        });
    }

    private normalizeDateForForm(value?: string): string {
        const normalized = String(value ?? '').trim();
        if (!normalized) {
            return '';
        }

        const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
            return normalized;
        }

        const dayFirstMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
        if (!dayFirstMatch) {
            return normalized;
        }

        const day = Number(dayFirstMatch[1]);
        const month = Number(dayFirstMatch[2]);
        const yearToken = dayFirstMatch[3];
        const year = yearToken.length === 2
            ? (Number(yearToken) >= 69 ? 1900 + Number(yearToken) : 2000 + Number(yearToken))
            : Number(yearToken);

        return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    private normalizeEditableFieldsForPreview(fields: PassportEditableFields): PassportEditableFields {
        return {
            passport_type: String(fields.passport_type || '').trim().toUpperCase(),
            issuing_country: String(fields.issuing_country || '').trim().toUpperCase(),
            surname: String(fields.surname || '').trim().toUpperCase(),
            given_names: String(fields.given_names || '').trim().toUpperCase(),
            passport_number: String(fields.passport_number || '').trim().toUpperCase(),
            sex: String(fields.sex || '').trim().toUpperCase(),
            date_of_birth: this.normalizeDateForForm(fields.date_of_birth),
            place_of_birth: String(fields.place_of_birth || '').trim().toUpperCase(),
            nationality_current: String(fields.nationality_current || '').trim().toUpperCase(),
            nationality_at_birth: String(fields.nationality_at_birth || '').trim().toUpperCase(),
            date_of_issue: this.normalizeDateForForm(fields.date_of_issue),
            date_of_expiry: this.normalizeDateForForm(fields.date_of_expiry),
            issuing_authority: String(fields.issuing_authority || '').trim().toUpperCase(),
            personal_number: String(fields.personal_number || '').trim().toUpperCase()
        };
    }

    private observeOverlayResize(): void {
        const stageElement = this.imageStage?.nativeElement;
        if (!stageElement || typeof ResizeObserver === 'undefined') {
            return;
        }

        this.resizeObserver?.disconnect();
        this.resizeObserver = new ResizeObserver(() => {
            this.syncOverlayImageSize();
        });
        this.resizeObserver.observe(stageElement);
    }

    private syncOverlayImageSize(): void {
        const imageElement = this.overlayImage?.nativeElement;
        if (!imageElement) {
            return;
        }

        const rect = imageElement.getBoundingClientRect();
        const nextWidth = Math.max(1, Math.round(rect.width));
        const nextHeight = Math.max(1, Math.round(rect.height));
        if (nextWidth === this.displayedImageWidth && nextHeight === this.displayedImageHeight) {
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

    private getBestFieldKeyForWord(word: OcrOverlayWord): InferenceFieldKey | null {
        const fieldMatches = this.inferenceResult?.overlay.field_matches;
        if (!fieldMatches) {
            return null;
        }

        let bestFieldKey: InferenceFieldKey | null = null;
        let bestScore = 0;

        for (const rawFieldKey of Object.keys(fieldMatches)) {
            const fieldKey = rawFieldKey as InferenceFieldKey;
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

    private buildInlineImageSrc(contentType?: string, base64Value?: string, fallback = ''): string {
        const normalizedBase64 = String(base64Value || '').trim();
        if (!normalizedBase64) {
            return fallback;
        }

        if (normalizedBase64.startsWith('data:')) {
            return normalizedBase64;
        }

        return `data:${contentType || 'image/jpeg'};base64,${normalizedBase64}`;
    }

    private readFileAsDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Khong doc duoc file upload.'));
            reader.readAsDataURL(file);
        });
    }
}

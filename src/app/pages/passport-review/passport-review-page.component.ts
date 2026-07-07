import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  LayoutLmItem,
  LayoutLmPayload,
  PassportEditableFields,
  PassportRecordDetail,
  PassportRecordSummary,
  SelectOption
} from '../../core/models/passport-record.model';
import { PassportRecordsService } from '../../core/services/passport-records.service';
import { RecordReviewModalComponent } from '../../components/record-review-modal/record-review-modal.component';

@Component({
  selector: 'app-passport-review-page',
  imports: [CommonModule, ReactiveFormsModule, DatePipe, RecordReviewModalComponent],
  templateUrl: './passport-review-page.component.html',
  styleUrl: './passport-review-page.component.scss'
})
export class PassportReviewPageComponent {
  private readonly recordsService = inject(PassportRecordsService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly pageSizeOptions = [5, 10, 20, 50];
  readonly statusOptions = ['all', 'pending', 'ocr_done', 'reviewing', 'reviewed', 'error'];

  records: PassportRecordSummary[] = [];
  selectedRecord: PassportRecordDetail | null = null;
  selectedLayoutLmItems: LayoutLmItem[] = [];
  countryOptions: SelectOption[] = [];
  recordForm: FormGroup = this.buildForm();

  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  totalItems = 0;
  statusFilter = 'all';

  isTableLoading = false;
  isModalVisible = false;
  isDetailLoading = false;
  isOverlayLoading = false;
  isSaving = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadCountryOptions();
    this.loadRecords(1);
  }

  loadRecords(page: number): void {
    this.isTableLoading = true;
    this.errorMessage = '';

    this.recordsService
      .listRecords(page, this.pageSize, this.statusFilter)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.records = response.items;
          this.currentPage = response.pagination.page;
          this.pageSize = response.pagination.page_size;
          this.totalPages = response.pagination.total_pages;
          this.totalItems = response.pagination.total_items;
          this.isTableLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.errorMessage = 'Khong tai duoc danh sach ban ghi tu backend.';
          this.isTableLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  onStatusFilterChange(status: string): void {
    this.statusFilter = status;
    this.loadRecords(1);
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.loadRecords(1);
  }

  openRecord(recordId: number): void {
    this.errorMessage = '';
    this.isModalVisible = true;
    this.isDetailLoading = true;
    this.isOverlayLoading = false;
    this.selectedLayoutLmItems = [];

    this.recordsService
      .getRecord(recordId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (record) => {
          if (record.layoutlm_items.length > 0) {
            this.hydrateSelectedRecord(record);
            return;
          }

          this.selectedRecord = record;
          this.recordForm = this.buildForm(record.editable_fields);
          this.isDetailLoading = false;
          this.isOverlayLoading = true;
          this.cdr.detectChanges();

          this.recordsService
            .generateLayoutLm(record.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (generatedRecord) => {
                this.hydrateSelectedRecord(generatedRecord);
              },
              error: () => {
                this.errorMessage = 'Khong tao duoc box LayoutLM cho ban ghi nay.';
                this.isOverlayLoading = false;
                this.cdr.detectChanges();
              }
            });
        },
        error: () => {
          this.errorMessage = 'Khong tai duoc chi tiet ban ghi.';
          this.isDetailLoading = false;
          this.isModalVisible = false;
          this.cdr.detectChanges();
        }
      });
  }

  closeModal(): void {
    this.isModalVisible = false;
    this.selectedRecord = null;
    this.selectedLayoutLmItems = [];
    this.errorMessage = '';
  }

  saveRecord(andMoveNext = false): void {
    if (!this.selectedRecord) {
      return;
    }

    if (this.recordForm.invalid) {
      this.recordForm.markAllAsTouched();
      this.cdr.detectChanges();
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    const payload = {
      editable_fields: this.recordForm.getRawValue() as PassportEditableFields,
      status: 'reviewed',
      layoutlm_review: this.selectedLayoutLmItems.length > 0
        ? this.buildLayoutLmPayload(this.selectedRecord.image_name, this.selectedLayoutLmItems)
        : undefined
    };

    this.recordsService
      .updateRecord(this.selectedRecord.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedRecord) => {
          this.hydrateSelectedRecord(updatedRecord);
          this.updateSummaryRow(updatedRecord);
          this.isSaving = false;
          this.cdr.detectChanges();

          if (andMoveNext && updatedRecord.next_record_id) {
            this.openRecord(updatedRecord.next_record_id);
            return;
          }

          if (!andMoveNext) {
            this.recordForm = this.buildForm(updatedRecord.editable_fields);
          }
        },
        error: () => {
          this.errorMessage = 'Khong luu duoc du lieu da chinh sua.';
          this.isSaving = false;
          this.cdr.detectChanges();
        }
      });
  }

  goToPreviousRecord(): void {
    if (this.selectedRecord?.previous_record_id) {
      this.openRecord(this.selectedRecord.previous_record_id);
    }
  }

  goToNextRecord(): void {
    if (this.selectedRecord?.next_record_id) {
      this.openRecord(this.selectedRecord.next_record_id);
    }
  }

  get selectedImageUrl(): string {
    if (!this.selectedRecord) {
      return '';
    }

    return this.recordsService.getImageUrl(this.selectedRecord.id);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  trackByRecordId(_: number, record: PassportRecordSummary): number {
    return record.id;
  }

  onLayoutLmItemsChange(items: LayoutLmItem[]): void {
    this.selectedLayoutLmItems = this.cloneLayoutLmItems(items);
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
          this.errorMessage = 'Khong tai duoc danh sach quoc gia tu backend.';
          this.cdr.detectChanges();
        }
      });
  }

  private buildForm(fields?: Partial<PassportEditableFields>): FormGroup {
    return this.formBuilder.group({
      passport_type: [fields?.passport_type ?? '', Validators.required],
      issuing_country: [fields?.issuing_country ?? '', Validators.required],
      surname: [fields?.surname ?? ''],
      given_names: [fields?.given_names ?? ''],
      passport_number: [fields?.passport_number ?? '', Validators.required],
      sex: [fields?.sex ?? '', Validators.required],
      date_of_birth: [fields?.date_of_birth ?? '', Validators.required],
      place_of_birth: [fields?.place_of_birth ?? ''],
      nationality_current: [fields?.nationality_current ?? '', Validators.required],
      nationality_at_birth: [fields?.nationality_at_birth ?? ''],
      date_of_issue: [fields?.date_of_issue ?? '', Validators.required],
      date_of_expiry: [fields?.date_of_expiry ?? '', Validators.required],
      issuing_authority: [fields?.issuing_authority ?? ''],
      personal_number: [fields?.personal_number ?? '']
    });
  }

  private hydrateSelectedRecord(record: PassportRecordDetail): void {
    this.selectedRecord = record;
    this.recordForm = this.buildForm(record.editable_fields);
    this.selectedLayoutLmItems = this.cloneLayoutLmItems(record.layoutlm_items);
    this.isDetailLoading = false;
    this.isOverlayLoading = false;
    this.cdr.detectChanges();
  }

  private buildLayoutLmPayload(fileName: string, items: LayoutLmItem[]): LayoutLmPayload {
    const orderedItems = [...items].sort((leftItem, rightItem) => {
      const topDiff = leftItem.bbox.top - rightItem.bbox.top;
      if (topDiff !== 0) {
        return topDiff;
      }

      return leftItem.bbox.left - rightItem.bbox.left;
    });

    return {
      file_name: fileName,
      tokens: orderedItems.map((item) => item.text),
      bboxes: orderedItems.map((item) => [
        item.bbox.left,
        item.bbox.top,
        item.bbox.left + item.bbox.width,
        item.bbox.top + item.bbox.height
      ]),
      ner_tags: orderedItems.map((item) => item.label || 'O')
    };
  }

  private cloneLayoutLmItems(items: LayoutLmItem[]): LayoutLmItem[] {
    return items.map((item) => ({
      ...item,
      bbox: { ...item.bbox }
    }));
  }

  private updateSummaryRow(detail: PassportRecordDetail): void {
    this.records = this.records.map((record) =>
      record.id === detail.id
        ? {
            ...record,
            status: detail.status,
            updated_at: detail.updated_at,
            full_name: [detail.editable_fields.surname, detail.editable_fields.given_names].filter(Boolean).join(' '),
            passport_number: detail.editable_fields.passport_number,
            date_of_birth: detail.editable_fields.date_of_birth,
            has_reviewed_json: true,
            has_layoutlm_json: detail.has_layoutlm_json,
            has_layoutlm_reviewed_json: detail.has_layoutlm_reviewed_json
          }
        : record
    );
  }
}

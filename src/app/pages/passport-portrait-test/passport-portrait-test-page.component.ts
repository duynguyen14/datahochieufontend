import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PassportPortraitData, PassportPortraitBox } from '../../core/models/passport-record.model';
import { PassportRecordsService } from '../../core/services/passport-records.service';

@Component({
  selector: 'app-passport-portrait-test-page',
  imports: [CommonModule],
  templateUrl: './passport-portrait-test-page.component.html',
  styleUrl: './passport-portrait-test-page.component.scss'
})
export class PassportPortraitTestPageComponent implements OnDestroy {
  private readonly recordsService = inject(PassportRecordsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('sourceImage') sourceImage?: ElementRef<HTMLImageElement>;
  @ViewChild('imageStage') imageStage?: ElementRef<HTMLDivElement>;

  selectedFileName = '';
  isDetecting = false;
  errorMessage = '';
  result: PassportPortraitData | null = null;
  displayedImageWidth = 0;
  displayedImageHeight = 0;
  private resizeObserver?: ResizeObserver;

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  onFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement | null;
    const file = inputElement?.files?.[0];
    if (!file) {
      return;
    }

    this.selectedFileName = file.name;
    this.runPortraitDetection(file);
    inputElement.value = '';
  }

  clearResult(): void {
    this.selectedFileName = '';
    this.isDetecting = false;
    this.errorMessage = '';
    this.result = null;
    this.displayedImageWidth = 0;
    this.displayedImageHeight = 0;
    this.cdr.detectChanges();
  }

  onSourceImageLoaded(): void {
    this.syncImageSize();
    this.observeImageResize();
  }

  get hasResult(): boolean {
    return !!this.result;
  }

  get faceBoxStyles(): Record<string, string> {
    return this.getBoundingBoxStyles(this.result?.face_bbox?.percent);
  }

  get portraitBoxStyles(): Record<string, string> {
    return this.getBoundingBoxStyles(this.result?.portrait_bbox?.percent);
  }

  get debugPreview(): string {
    if (!this.result) {
      return '{}';
    }

    return JSON.stringify(this.result, null, 2);
  }

  private runPortraitDetection(file: File): void {
    this.isDetecting = true;
    this.errorMessage = '';
    this.result = null;

    this.recordsService
      .uploadPassportPortrait(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.result = response.data;
          this.isDetecting = false;
          this.cdr.detectChanges();
          setTimeout(() => this.syncImageSize());
        },
        error: (error) => {
          this.result = null;
          this.isDetecting = false;
          this.errorMessage = error?.error?.detail || 'Khong detect duoc anh mat tu passport.';
          this.cdr.detectChanges();
        }
      });
  }

  private observeImageResize(): void {
    const stageElement = this.imageStage?.nativeElement;
    if (!stageElement || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.syncImageSize();
    });
    this.resizeObserver.observe(stageElement);
  }

  private syncImageSize(): void {
    const imageElement = this.sourceImage?.nativeElement;
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

  private getBoundingBoxStyles(box?: PassportPortraitBox): Record<string, string> {
    if (!box || !this.displayedImageWidth || !this.displayedImageHeight) {
      return {};
    }

    const leftPx = (box.left / 100) * this.displayedImageWidth;
    const topPx = (box.top / 100) * this.displayedImageHeight;
    const widthPx = (box.width / 100) * this.displayedImageWidth;
    const heightPx = (box.height / 100) * this.displayedImageHeight;

    return {
      left: `${leftPx}px`,
      top: `${topPx}px`,
      width: `${Math.max(1, widthPx)}px`,
      height: `${Math.max(1, heightPx)}px`
    };
  }
}

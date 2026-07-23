import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, switchMap } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  LayoutLmPayload,
  MaskReviewDecisionPayload,
  MaskReviewSessionResponse,
  PassportFaceMatchRequestPayload,
  PassportFaceMatchResponse,
  PassportInferenceResponse,
  OcrOverlayResponse,
  PassportPortraitResponse,
  PassportRecordDetail,
  PassportRecordListResponse,
  SelectOption,
  UpdatePassportRecordPayload
} from '../models/passport-record.model';

@Injectable({
  providedIn: 'root'
})
export class PassportRecordsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;
  private readonly passportInferenceApiKey = environment.passportInferenceApiKey;

  listRecords(page: number, pageSize: number, status?: string): Observable<PassportRecordListResponse> {
    let params = new HttpParams().set('page', page).set('page_size', pageSize);

    if (status && status !== 'all') {
      params = params.set('status', status);
    }

    return this.http.get<PassportRecordListResponse>(`${this.apiBaseUrl}/passport-records`, {
      params
    });
  }

  getRecord(recordId: number): Observable<PassportRecordDetail> {
    return this.http.get<PassportRecordDetail>(`${this.apiBaseUrl}/passport-records/${recordId}`);
  }

  updateRecord(recordId: number, payload: UpdatePassportRecordPayload): Observable<PassportRecordDetail> {
    return this.http.put<PassportRecordDetail>(
      `${this.apiBaseUrl}/passport-records/${recordId}`,
      payload
    );
  }

  getRecordOcrOverlay(recordId: number): Observable<OcrOverlayResponse> {
    return this.http.get<OcrOverlayResponse>(
      `${this.apiBaseUrl}/passport-records/${recordId}/ocr-overlay`
    );
  }

  getRecordPortrait(recordId: number): Observable<PassportPortraitResponse> {
    return this.http.get<PassportPortraitResponse>(
      `${this.apiBaseUrl}/passport-records/${recordId}/portrait`
    );
  }

  generateLayoutLm(recordId: number): Observable<PassportRecordDetail> {
    return this.http.post<PassportRecordDetail>(
      `${this.apiBaseUrl}/passport-records/${recordId}/layoutlm/generate`,
      {}
    );
  }

  updateLayoutLmReview(recordId: number, payload: LayoutLmPayload): Observable<PassportRecordDetail> {
    return this.http.put<PassportRecordDetail>(
      `${this.apiBaseUrl}/passport-records/${recordId}/layoutlm-review`,
      payload
    );
  }

  getCountryOptions(): Observable<{ items: SelectOption[] }> {
    return this.http.get<{ items: SelectOption[] }>(`${this.apiBaseUrl}/code-values/countries`);
  }

  uploadPassportInference(file: File): Observable<PassportInferenceResponse> {
    return from(this.readFileAsDataUrl(file)).pipe(
      switchMap((base64Value) =>
        this.http.post<PassportInferenceResponse>(`${this.apiBaseUrl}/passport-inference/upload`, {
          api_key: this.passportInferenceApiKey,
          base64: base64Value,
          file_name: file.name
        })
      )
    );
  }

  verifyPassportFaceMatch(payload: Omit<PassportFaceMatchRequestPayload, 'api_key'>): Observable<PassportFaceMatchResponse> {
    return this.http.post<PassportFaceMatchResponse>(`${this.apiBaseUrl}/passport-face-match/verify`, {
      ...payload,
      api_key: this.passportInferenceApiKey
    });
  }

  uploadPassportPortrait(file: File): Observable<PassportPortraitResponse> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<PassportPortraitResponse>(`${this.apiBaseUrl}/passport-portrait/upload`, formData);
  }

  getMaskReviewSession(fileName?: string): Observable<MaskReviewSessionResponse> {
    let params = new HttpParams().set('_', Date.now());
    if (fileName) {
      params = params.set('file_name', fileName);
    }

    return this.http.get<MaskReviewSessionResponse>(`${this.apiBaseUrl}/mask-review`, { params });
  }

  submitMaskReviewDecision(payload: MaskReviewDecisionPayload): Observable<MaskReviewSessionResponse> {
    return this.http.post<MaskReviewSessionResponse>(`${this.apiBaseUrl}/mask-review/decision`, payload);
  }

  getImageUrl(recordId: number, cacheBuster?: string | number): string {
    const suffix = cacheBuster !== undefined ? `?v=${encodeURIComponent(String(cacheBuster))}` : '';
    return `${this.apiBaseUrl}/passport-records/${recordId}/image${suffix}`;
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

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  LayoutLmPayload,
  OcrOverlayResponse,
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

  getImageUrl(recordId: number): string {
    return `${this.apiBaseUrl}/passport-records/${recordId}/image`;
  }
}

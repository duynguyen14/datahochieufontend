export interface PassportRecordSummary {
  id: number;
  image_path: string;
  image_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  passport_number: string;
  date_of_birth: string;
  has_reviewed_json: boolean;
  has_layoutlm_json: boolean;
  has_layoutlm_reviewed_json: boolean;
}

export interface PassportRecordPagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

export interface PassportRecordListResponse {
  items: PassportRecordSummary[];
  pagination: PassportRecordPagination;
}

export interface PassportEditableFields {
  passport_type: string;
  issuing_country: string;
  surname: string;
  given_names: string;
  passport_number: string;
  sex: string;
  date_of_birth: string;
  place_of_birth: string;
  nationality_current: string;
  nationality_at_birth: string;
  date_of_issue: string;
  date_of_expiry: string;
  issuing_authority: string;
  personal_number: string;
}

export interface PassportRecordDetail {
  id: number;
  image_path: string;
  image_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  error_message: string;
  raw_ocr_text: string;
  extracted_json: Record<string, unknown>;
  reviewed_json: Record<string, unknown>;
  editable_fields: PassportEditableFields;
  layoutlm_json: LayoutLmPayload;
  layoutlm_reviewed_json: LayoutLmPayload;
  layoutlm_active_json: LayoutLmPayload;
  layoutlm_items: LayoutLmItem[];
  layoutlm_available_labels: string[];
  layoutlm_image_width: number;
  layoutlm_image_height: number;
  has_layoutlm_json: boolean;
  has_layoutlm_reviewed_json: boolean;
  previous_record_id: number | null;
  next_record_id: number | null;
}

export interface UpdatePassportRecordPayload {
  editable_fields: PassportEditableFields;
  status: string;
  layoutlm_review?: LayoutLmPayload;
}

export interface OcrOverlayWordBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrOverlayWord {
  text: string;
  confidence: number;
  bbox: OcrOverlayWordBox;
}

export interface OcrOverlayResponse {
  record_id: number;
  image_path: string;
  image_width: number;
  image_height: number;
  words: OcrOverlayWord[];
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface LayoutLmPayload {
  file_name: string;
  tokens: string[];
  bboxes: number[][];
  ner_tags: string[];
}

export interface LayoutLmItem {
  id: number;
  text: string;
  label: string;
  bbox: OcrOverlayWordBox;
}

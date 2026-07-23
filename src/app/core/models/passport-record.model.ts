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

export interface OcrFieldMatch {
  field_key: string;
  expected_value: string;
  text: string;
  score: number;
  matched: boolean;
  match_type: string;
  source: string;
  word_ids: string[];
  line_ids: string[];
  boundingBox: OcrOverlayWordBox;
}

export interface OcrOverlayWord {
  id: string;
  text: string;
  confidence: number;
  boundingBox: OcrOverlayWordBox;
  line_id: string;
  order: number;
  rotation: number;
}

export interface OcrOverlayData {
  record_id?: number;
  image_path: string;
  image_url: string;
  image_width: number;
  image_height: number;
  rotation_applied: number;
  words: OcrOverlayWord[];
  field_matches: Record<string, OcrFieldMatch>;
}

export interface OcrOverlayResponse {
  status: string;
  data: OcrOverlayData;
}

export interface PassportPortraitBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PassportPortraitBoundingBox {
  pixels: PassportPortraitBox;
  percent: PassportPortraitBox;
}

export interface PassportPortraitData {
  image_id?: string;
  image_name?: string;
  record_id?: number;
  image_path?: string;
  image_url?: string;
  image_width?: number;
  image_height?: number;
  detected: boolean;
  face_bbox: PassportPortraitBoundingBox;
  portrait_bbox: PassportPortraitBoundingBox;
  portrait_image_path: string;
  portrait_image_url: string;
}

export interface PassportPortraitResponse {
  status: string;
  data: PassportPortraitData;
}

export interface PassportInferencePerformance {
  cache_hit: boolean;
  ocr_duration_ms: number;
  donut_duration_ms: number;
  total_duration_ms: number;
  donut_cpu_threads: number;
  donut_device: string;
  donut_model_dir: string;
  donut_processor_dir: string;
}

export interface PassportInlineImage {
  file_name: string;
  content_type: string;
  base64: string;
}

export interface PassportInferenceFaceImage extends PassportInlineImage {
  detected: boolean;
}

export interface PassportInferenceData {
  image_id: string;
  image_name: string;
  image_url: string;
  image_content_type: string;
  image_base64: string;
  editable_fields: PassportEditableFields;
  donut_raw_text: string;
  donut_json: Record<string, unknown>;
  task_prompt: string;
  performance: PassportInferencePerformance;
  face_image: PassportInferenceFaceImage;
  overlay: OcrOverlayData;
}

export interface PassportInferenceResponse {
  status: string;
  data: PassportInferenceData;
}

export interface PassportFaceMatchImageData extends PassportInlineImage {
  detected: boolean;
  face_count: number;
  face_bbox: OcrOverlayWordBox | null;
  face_confidence: number;
  aligned_face_content_type: string;
  aligned_face_base64: string;
}

export interface PassportFaceMatchThresholds {
  match: number;
  review: number;
  metric: string;
}

export interface PassportFaceMatchEngine {
  detector: string;
  recognizer: string;
  runtime: string;
  device: string;
  target: string;
  available_providers: string[];
  active_detector_providers: string[];
  active_recognizer_providers: string[];
  fallback_reason?: string;
  detector_model_path: string;
  recognizer_model_path: string;
  input_width: number;
  input_height: number;
}

export interface PassportFaceMatchPerformance {
  passport_detect_duration_ms: number;
  uploaded_detect_duration_ms: number;
  passport_align_embed_duration_ms: number;
  uploaded_align_embed_duration_ms: number;
  match_duration_ms: number;
  total_duration_ms: number;
}

export interface PassportFaceMatchData {
  matched: boolean;
  review_required: boolean;
  decision: 'match' | 'review' | 'mismatch';
  score: number;
  message: string;
  thresholds: PassportFaceMatchThresholds;
  engine: PassportFaceMatchEngine;
  passport_face: PassportFaceMatchImageData;
  uploaded_face: PassportFaceMatchImageData;
  performance: PassportFaceMatchPerformance;
  request_hash: string;
}

export interface PassportFaceMatchRequestPayload {
  api_key: string;
  passport_face_base64: string;
  passport_face_file_name: string;
  uploaded_face_base64: string;
  uploaded_face_file_name: string;
}

export interface PassportFaceMatchResponse {
  status: string;
  data: PassportFaceMatchData;
}

export type MaskReviewDecisionStatus = 'approved' | 'rejected';

export interface MaskReviewCurrentItem {
  file_name: string;
  source_file_name: string;
  image_url: string;
  position: number;
  status: MaskReviewDecisionStatus | 'pending';
  is_reviewed: boolean;
  previous_file_name: string;
  next_file_name: string;
}

export interface MaskReviewDecisionRecord {
  file_name: string;
  status: MaskReviewDecisionStatus;
  reviewed_at_utc: string;
  moved_to_error_path: string;
}

export interface MaskReviewStats {
  total_items: number;
  reviewed_items: number;
  approved_items: number;
  rejected_items: number;
  pending_items: number;
}

export interface MaskReviewSessionData {
  image_dir: string;
  error_dir: string;
  metadata_path: string;
  review_state_path: string;
  current_item: MaskReviewCurrentItem | null;
  recent_decisions: MaskReviewDecisionRecord[];
  stats: MaskReviewStats;
  last_reviewed_file_name: string;
}

export interface MaskReviewSessionResponse {
  status: string;
  data: MaskReviewSessionData;
}

export interface MaskReviewDecisionPayload {
  file_name: string;
  decision: MaskReviewDecisionStatus;
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

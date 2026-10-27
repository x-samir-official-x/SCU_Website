export type Role = 'student' | 'moderator' | 'admin';
export type Status = 'draft' | 'pending' | 'revision' | 'approved' | 'rejected' | 'cancelled';
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  student_id: string | null;
  year: string | null;
  active: number;
}
export interface Faculty {
  platformName: string;
  brand: string;
  logoPath: string;
  faculty: string;
  university: string;
  period: string;
  periodId: string;
  office: string;
  points: number;
  activityTypes: string[];
}
export interface Session {
  user: User | null;
  csrfToken?: string;
  demo: boolean;
  preview?: boolean;
  faculty: Faculty;
}
export interface Attachment {
  id: number;
  original_name: string;
  mime: string;
  size: number;
  created_at: string;
}
export interface Audit {
  id: number;
  action: string;
  note: string;
  actor_name: string;
  created_at: string;
}
export interface ActivityRequest {
  id: number;
  user_id: number;
  period: string;
  title: string;
  category: string;
  organization: string;
  activity_date: string;
  description: string;
  status: Status;
  review_note: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  version: number;
  physical_received: number;
  student_name?: string;
  student_id?: string;
  year?: string;
  attachments?: Attachment[];
  events?: Audit[];
}
export interface Staff extends User {
  created_at: string;
}

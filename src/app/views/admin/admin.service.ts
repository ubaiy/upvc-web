import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { quiet } from '../../shared/interceptors/request-options';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { AdminCompany, AuditPage, FeatureMap, Payment, PaymentMode, Plan } from './admin.models';

export interface CreateCompanyRequest {
  company: { name: string; state_code?: string; email?: string; phone?: string };
  owner: { name: string; email: string };
  plan: string;
  trial_days: number;
  note?: string;
}

export interface ActivateRequest {
  months: number;
  amount_paise: number;
  mode: PaymentMode;
  plan?: string;
  reference?: string;
  paid_on?: string;
  from?: string;
  note?: string;
}

export interface PlanRequest {
  code?: string;
  name: string;
  price_paise: number;
  seats: number;
  grace_days: number;
  features: FeatureMap;
  is_active: boolean;
}

/**
 * The platform admin api: api/v1/admin/*. Every call is quiet: the screens of
 * the admin area show their own loading rows and say a refusal next to the form.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private api: ApiHttpService) {}

  companies(): Observable<AdminCompany[]> {
    return this.api.get('admin/companies', quiet()).pipe(map((res) => res.data.companies));
  }

  company(id: number): Observable<AdminCompany> {
    return this.api.get(`admin/companies/${id}`, quiet()).pipe(map((res) => res.data));
  }

  createCompany(body: CreateCompanyRequest): Observable<AdminCompany> {
    return this.post('admin/companies', body);
  }

  changePlan(id: number, plan: string, note?: string): Observable<AdminCompany> {
    return this.post(`admin/companies/${id}/plan`, withNote({ plan }, note));
  }

  activate(id: number, body: ActivateRequest): Observable<AdminCompany> {
    return this.post(`admin/companies/${id}/activate`, body);
  }

  extendTrial(id: number, days: number, note?: string): Observable<AdminCompany> {
    return this.post(`admin/companies/${id}/extend-trial`, withNote({ days }, note));
  }

  suspend(id: number, note?: string): Observable<AdminCompany> {
    return this.post(`admin/companies/${id}/suspend`, withNote({}, note));
  }

  reactivate(id: number, note?: string): Observable<AdminCompany> {
    return this.post(`admin/companies/${id}/reactivate`, withNote({}, note));
  }

  /** `null` puts the plan's seats back. */
  setSeats(id: number, seats: number | null, note?: string): Observable<AdminCompany> {
    return this.post(`admin/companies/${id}/overrides`, withNote({ seats_override: seats }, note));
  }

  /** The whole override map; `null` puts the plan's features back. */
  setFeatures(id: number, features: FeatureMap | null, note?: string): Observable<AdminCompany> {
    return this.post(`admin/companies/${id}/overrides`, withNote({ features_override: features }, note));
  }

  /** Seats and features in one request. Only the keys given are changed; `null` puts the plan's value back. */
  setOverrides(
    id: number,
    changes: { seats_override?: number | null; features_override?: FeatureMap | null },
    note?: string
  ): Observable<AdminCompany> {
    return this.post(`admin/companies/${id}/overrides`, withNote({ ...changes }, note));
  }

  payments(id: number): Observable<Payment[]> {
    return this.api.get(`admin/companies/${id}/payments`, quiet()).pipe(map((res) => res.data.payments));
  }

  plans(): Observable<Plan[]> {
    return this.api.get('admin/plans', quiet()).pipe(map((res) => res.data.plans));
  }

  createPlan(body: PlanRequest): Observable<Plan> {
    return this.post('admin/plans', body);
  }

  updatePlan(id: number, body: PlanRequest): Observable<Plan> {
    const { code, ...rest } = body;
    return this.post(`admin/plans/${id}`, rest);
  }

  /** Refused with 409 and a message while a company is on the plan. */
  deletePlan(id: number): Observable<unknown> {
    return this.post(`admin/plans/${id}/delete`, {});
  }

  auditLog(page = 1, companyId?: number | null, perPage = 50): Observable<AuditPage> {
    const query = `page=${page}&per_page=${perPage}` + (companyId ? `&company_id=${companyId}` : '');
    return this.api.get(`admin/audit-log?${query}`, quiet()).pipe(map((res) => res.data));
  }

  private post(url: string, body: unknown): Observable<any> {
    return this.api.post(url, body, quiet()).pipe(map((res) => res.data));
  }
}

function withNote<T extends object>(body: T, note?: string): T & { note?: string } {
  const text = (note || '').trim();
  return text ? { ...body, note: text } : body;
}

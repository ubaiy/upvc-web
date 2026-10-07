import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { quiet } from 'src/app/shared/interceptors/request-options';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';
import {
  Checklist,
  Comparison,
  CostHead,
  Figures,
  FiguresBody,
  HardwareRule,
  HardwareSet,
  HardwareSetDetail,
  HardwareSets,
  MethodAnswer,
  ProductRow,
  RoleChange,
  SetupRefusal,
  SystemBody,
  SystemDetail,
  SystemRow,
} from './pricing-setup.models';

/** The api's sentences of a refusal: `data.errors` of a 422, as a list whatever shape it came in. */
function sentences(errors: unknown): string[] {
  if (Array.isArray(errors)) return errors.map(String);
  if (errors && typeof errors === 'object') return Object.values(errors).flatMap((said) => (Array.isArray(said) ? said.map(String) : [String(said)]));
  return [];
}

/** What a failed call is called on the screen. A 5xx carries the server's own exception text, which is not for the screen. */
export function toRefusal(err: unknown, fallback: string): SetupRefusal {
  if (err instanceof SetupRefusal) return err;
  if (!(err instanceof HttpErrorResponse)) return new SetupRefusal((err as Error)?.message || fallback);
  const body = err.error ?? {};
  const errors = sentences(body?.data?.errors ?? body?.errors);
  const message =
    err.status === 0
      ? 'We could not reach the server. Check your connection. Nothing was changed.'
      : err.status === 403
      ? body?.message || 'Your role cannot do this. Ask the owner of the account.'
      : err.status === 404
      ? 'This was not found. It may have been removed.'
      : err.status === 429
      ? 'Too many requests at once. Wait a minute, then try again.'
      : err.status >= 500
      ? fallback
      : body?.message || errors[0] || fallback;
  return new SetupRefusal(message, errors, String(body?.code ?? ''), err.status, body?.data ?? null);
}

/**
 * "Pricing setup": the fabricator's own profile systems, the role, weight and rate of each
 * profile, the cut rules, the hardware sets and the company's figures. Every route is the
 * api's (phase-62 contract); the web sends what is typed and shows what comes back.
 */
@Injectable({ providedIn: 'root' })
export class PricingSetupService {
  constructor(private api: ApiHttpService) {}

  /** GET pricing-setup: what is ready and what is missing for a price. */
  checklist(): Observable<Checklist> {
    return this.read<Checklist>('pricing-setup', 'The check list could not be loaded.').pipe(
      map((data) => ({
        ...data,
        methods: data?.methods ?? [],
        missing: data?.missing ?? [],
        notes: data?.notes ?? [],
        unpriced_profiles: data?.unpriced_profiles ?? [],
        systems: data?.systems ?? [],
        example: data?.example ?? null,
        roles: data?.roles ?? [],
        charged_by_hardware_set: data?.charged_by_hardware_set ?? {},
      }))
    );
  }

  system(id: number): Observable<SystemDetail> {
    return this.read<SystemDetail>(`pricing-setup/systems/${id}`, 'The profile system could not be loaded.');
  }

  /** POST profile-system/add. The answer is the row; its roles and rules are read with `system`. */
  addSystem(body: SystemBody): Observable<SystemRow> {
    return this.send<SystemRow>('post', 'profile-system/add', body, 'The profile system was not added.');
  }

  updateSystem(id: number, body: SystemBody): Observable<SystemRow> {
    return this.send<SystemRow>('post', `profile-system/update/${id}`, body, 'The profile system was not saved.');
  }

  /** POST pricing-setup/systems/{id}/copy: a new system with the profiles (under new codes), roles and rules of the first. */
  copySystem(id: number, name: string): Observable<SystemDetail> {
    return this.send<SystemDetail>('post', `pricing-setup/systems/${id}/copy`, { name }, 'The profile system was not copied.');
  }

  /** Nothing is deleted: a retired system takes no new window and does not count for readiness. */
  retire(id: number, retired: boolean): Observable<SystemDetail> {
    return this.send<SystemDetail>('post', `pricing-setup/systems/${id}/retire`, { retired }, 'The profile system was not changed.');
  }

  /** Give and take roles, with the weight and the rate of each profile. Nothing is saved when one row is refused. */
  saveRoles(id: number, roles: RoleChange[]): Observable<SystemDetail> {
    return this.send<SystemDetail>('put', `pricing-setup/systems/${id}/roles`, { roles }, 'The profiles were not saved.');
  }

  /** A number sets a rule, null removes it; `template` first copies a pack for the keys the system does not have. */
  saveRules(id: number, rules: Record<string, number | null>, template?: string): Observable<SystemDetail> {
    const body: Record<string, unknown> = {};
    if (Object.keys(rules).length) body['rules'] = rules;
    if (template) body['template'] = template;
    return this.send<SystemDetail>('put', `pricing-setup/systems/${id}/rules`, body, 'The rules were not saved.');
  }

  /** The note of one rule: the api keeps it on the single-rule route (`rule_key`, `value_mm`, `notes`). */
  saveRuleNote(id: number, key: string, value: number, notes: string): Observable<unknown> {
    return this.send<unknown>('post', `profile-system/${id}/rules/add`, { rule_key: key, value_mm: value, notes }, 'The note was not saved.');
  }

  product(id: number): Observable<ProductRow> {
    return this.read<ProductRow>(`product/${id}`, 'The profile could not be loaded.');
  }

  products(): Observable<ProductRow[]> {
    return this.read<ProductRow[]>('product/get-product-list', 'The profiles could not be loaded.').pipe(map((rows) => (Array.isArray(rows) ? rows : [])));
  }

  addProduct(body: Partial<ProductRow>): Observable<ProductRow> {
    return this.send<ProductRow>('post', 'product/add', body, 'The profile was not added.');
  }

  updateProduct(id: number, body: Partial<ProductRow>): Observable<ProductRow> {
    return this.send<ProductRow>('post', `product/update/${id}`, body, 'The profile was not saved.');
  }

  /** Refused, with the quotation numbers in the sentence, while a quotation uses the profile. */
  deleteProduct(id: number): Observable<unknown> {
    return this.send<unknown>('post', `product/delete/${id}`, undefined, 'The profile was not removed.');
  }

  figures(): Observable<Figures> {
    return this.read<Figures>('pricing-setup/settings', 'The figures could not be loaded.').pipe(map(toFigures));
  }

  /** A key not sent stays; null puts a figure back to its default, or unsets a rate. */
  saveFigures(body: FiguresBody): Observable<Figures> {
    return this.send<Figures>('put', 'pricing-setup/settings', body, 'The figures were not saved.').pipe(map(toFigures));
  }

  /** 422 `not_ready` while the check list is not complete: the refusal carries each missing sentence. */
  setMethod(method: string): Observable<MethodAnswer> {
    return this.send<MethodAnswer>('put', 'pricing-setup/method', { method }, 'The pricing method was not changed.');
  }

  /** GET pricing-setup/compare: the last saved windows priced by both methods; `asSystem` prices a window of no system as that one. Nothing is stored. */
  compare(asSystem: number | null = null, limit = 20): Observable<Comparison> {
    return this.read<Comparison>(`pricing-setup/compare?limit=${limit}` + (asSystem ? `&as_system_id=${asSystem}` : ''), 'The comparison could not be worked out.').pipe(
      map((data) => ({ ...data, windows: data?.windows ?? [], totals: data?.totals ?? { windows: 0, compared: 0, not_priced: 0, old: 0, new: 0, difference: 0 } }))
    );
  }

  hardwareSets(): Observable<HardwareSets> {
    return this.read<HardwareSets>('hardware-sets', 'The hardware sets could not be loaded.').pipe(
      map((data) => ({ sets: data?.sets ?? [], packs: data?.packs ?? [], categories: data?.categories ?? [] }))
    );
  }

  hardwareSet(id: number): Observable<HardwareSetDetail> {
    return this.read<HardwareSetDetail>(`hardware-sets/${id}`, 'The hardware set could not be loaded.');
  }

  /** `{ pack }` copies one of the ready packs into the company; `{ code, name, category }` makes an empty set. */
  addHardwareSet(body: Record<string, unknown>): Observable<HardwareSetDetail> {
    return this.send<HardwareSetDetail>('post', 'hardware-sets', body, 'The hardware set was not added.');
  }

  updateHardwareSet(id: number, body: Record<string, unknown>): Observable<HardwareSetDetail> {
    return this.send<HardwareSetDetail>('put', `hardware-sets/${id}`, body, 'The hardware set was not saved.');
  }

  /** Refused (422) while the set is the default of its kind, or tied to a system in use. */
  deleteHardwareSet(id: number): Observable<{ deleted: { id: number; code: string; name: string }; sets: HardwareSet[] }> {
    return this.remove(`hardware-sets/${id}`, 'The hardware set was not deleted.');
  }

  addHardwareRule(setId: number, body: Partial<HardwareRule>): Observable<HardwareSetDetail> {
    return this.send<HardwareSetDetail>('post', `hardware-sets/${setId}/rules`, body, 'The line was not added.');
  }

  updateHardwareRule(ruleId: number, body: Partial<HardwareRule>): Observable<HardwareSetDetail> {
    return this.send<HardwareSetDetail>('put', `hardware-sets/rules/${ruleId}`, body, 'The line was not saved.');
  }

  deleteHardwareRule(ruleId: number): Observable<HardwareSetDetail> {
    return this.remove<HardwareSetDetail>(`hardware-sets/rules/${ruleId}`, 'The line was not removed.');
  }

  /** The hardware items of the catalogue: what a line of a set can be priced with. */
  hardwareItems(): Observable<CostHead[]> {
    return this.read<any[]>('costhead/list', 'The hardware items could not be loaded.').pipe(
      map((rows) =>
        (Array.isArray(rows) ? rows : [])
          .filter((row) => row?.costhead !== 'Glazzing')
          .map((row) => ({ id: Number(row.id), name: String(row.name ?? ''), cost: Number(row.cost) || 0, unit: String(row.unit ?? ''), costhead: String(row.costhead ?? '') }))
      )
    );
  }

  private read<T>(url: string, fallback: string): Observable<T> {
    return this.api.get(url, quiet()).pipe(
      map((res) => this.unwrap<T>(res, fallback)),
      catchError((err) => throwError(() => toRefusal(err, fallback)))
    );
  }

  private remove<T>(url: string, fallback: string): Observable<T> {
    return this.api.delete(url, quiet()).pipe(
      map((res) => this.unwrap<T>(res, fallback)),
      catchError((err) => throwError(() => toRefusal(err, fallback)))
    );
  }

  private send<T>(verb: 'post' | 'put', url: string, body: unknown, fallback: string): Observable<T> {
    return this.api[verb](url, body, quiet()).pipe(
      map((res) => this.unwrap<T>(res, fallback)),
      catchError((err) => throwError(() => toRefusal(err, fallback)))
    );
  }

  /** The older routes (profile-system/add, product/add) refuse with HTTP 200 and `status: 0`. */
  private unwrap<T>(res: any, fallback: string): T {
    if (!res || res.success !== true) {
      throw new SetupRefusal(res?.message || fallback, sentences(res?.data?.errors), String(res?.code ?? ''), 200, res?.data ?? null);
    }
    return res.data as T;
  }
}

/** The settings answer with every list in place, whatever the api left out. */
export function toFigures(data: Figures): Figures {
  return {
    settings: data?.settings ?? {},
    set_by_company: data?.set_by_company ?? [],
    defaults: data?.defaults ?? {},
    labels: data?.labels ?? {},
    missing: data?.missing ?? [],
    glass: data?.glass ?? [],
    colours: data?.colours ?? [],
  };
}

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Konva from 'konva';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import * as sharedClasses from 'src/app/shared/class/sharedClasses';
import {
  AllDropdowns,
  IAllDropDownsDto,
} from 'src/app/shared/model/common/allDropdowns.model';
import { IProfileColorDto } from 'src/app/shared/model/profile/profile-color.model';
import { IProfileDropdown } from 'src/app/shared/model/profile/profileDropdown.model';
import { FinalService } from 'src/app/shared/services/final.service';
import { KonvaElementService } from 'src/app/shared/services/konva-element.service';
import * as designConst from 'src/app/shared/configs/design/constConfig';
import {
  getFramePoints,
  createFrameLine,
  createMullion as createMullionShape,
} from 'src/app/shared/configs/design/framePoints.config';
import { KonvaEventObject } from 'konva/lib/Node';
import { IMasterListDto } from 'src/app/shared/model/masters/masterList.model';
import { IOpenDirectionDrpDto } from 'src/app/shared/model/quotation/open-directionDrp.model';
import { QuotationService } from '../../quotation.service';
import { DropdownService } from 'src/app/shared/services/dropdown.service';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ProfileService } from 'src/app/views/masters/profile/profile.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { cilLoopCircular } from '@coreui/icons';
import { WindowFrame, Partition } from '../../../../shared/class/designClass';
import {
  Subject,
  Subscription,
  catchError,
  debounceTime,
  of,
  switchMap,
} from 'rxjs';
import { IResponseDtoOfProduct } from './response.model';
const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

/**
 * State-driven window model (single source of truth for the canvas).
 *
 * The window is a recursive tree of {@link PaneNode}. A node is either:
 *  - a LEAF pane (no `split`): a single glazed area, optionally `framed`
 *    (drawn with its own sash profile band — e.g. a slidding/openable palla
 *    division or sash leaf), or
 *  - a SPLIT: subdivided into `children` along `direction`, separated by a
 *    divider. `kind` distinguishes a `palla` division (adjacent framed sashes,
 *    NOT saved to the mullion payload) from a manual `mullion` split (a real
 *    mullion bar drawn between two glazed children and saved to `mullionArray`).
 *
 * `fractions` holds each child's share of the available length along the split
 * axis (always sums to 1). Resizing a portion only mutates these fractions and
 * redraws — geometry stays consistent by construction, so nothing accumulates
 * or orphans across resize/spec changes.
 *
 * The `_*` fields are transient render bookkeeping repopulated on every
 * `_redraw()` (last rendered mm sizes) so portion-resize can map a typed mm
 * value back to a fraction without re-deriving the whole layout.
 */
type SplitKind = 'palla' | 'mullion';

interface PaneSplit {
  direction: 'vertical' | 'horizontal';
  kind: SplitKind;
  /** Selected mullion profile id (mullion kind only; undefined for palla). */
  profileId?: string | number;
  /** Divider face width in mm (mullion bar thickness; 0 effective for palla). */
  mullionWidthMm: number;
  children: PaneNode[];
  /** Per-child size share along the split axis; sums to 1. */
  fractions: number[];
  /** Transient: available mm along the split axis at last render. */
  _availMm?: number;
}

interface PaneNode {
  id: string;
  /** Draw a sash profile band around this node (palla sash / openable leaf). */
  framed?: boolean;
  /**
   * Per-leaf opening / slide direction. Casement: Left | Right | Top | Bottom |
   * Tilt & Turn Left | Tilt & Turn Right. Sliding: Left | Right. When absent the
   * global `opening_direction` control value is used (legacy whole-window mode).
   * Only meaningful on a LEAF; a split node delegates to its children.
   */
  openingDirection?: string;
  /**
   * Per-leaf handle master-list id (matches an entry in {@link handleList}). The
   * handle's NAME drives which glyph family is drawn (lever / T / C / cockspur /
   * knob / keep). When absent the global `handle_id` control value is used.
   * Only meaningful on a LEAF; VISUAL only — does not affect the save payload.
   */
  handleId?: string | number;
  /**
   * Per-leaf hinge type ('Flate Hinges' | 'Friction' | '3D Hinges'). Drives how
   * many hinge tick marks are drawn on the hinge stile (3 for 3D, else 2). When
   * absent the global `hinges_type` control value is used. LEAF-only; VISUAL only.
   */
  hingesType?: string;
  /**
   * Per-leaf casement type ('Fixed' | 'Openable'). This is what makes a window a
   * SUPER SYSTEM: within a single Casement window each section (leaf) can be Fixed
   * (plain glass) or Openable (sash band + egress chevron + handle + hinges drawn
   * using this leaf's own openingDirection / handleId / hingesType). When absent
   * the global `casement_type` control value is used (legacy whole-window mode).
   * Only meaningful on a LEAF; a split node delegates to its children.
   */
  casementType?: 'Fixed' | 'Openable';
  /**
   * Per-leaf SYSTEM ('Casement' | 'Slidding'). This is what makes the window a true
   * SUPER (composite "cabin") SYSTEM: each section (leaf) is independently its own
   * system — a Casement section renders sash + egress + handle + hinges (Openable)
   * or plain glass (Fixed) while a Slidding section beside it renders the slide
   * symbology — driven entirely by THIS leaf's own `category`. When absent the
   * global `category_type` control value is used (legacy whole-window mode). Only
   * meaningful on a LEAF; a split node delegates to its children. Changing one
   * section's category must NOT rebuild the tree or convert the whole window.
   */
  category?: 'Casement' | 'Slidding';
  /**
   * Per-leaf sash profile id (matches an entry in {@link sashList}). Captured per
   * section so the backend can cost each openable sash independently. When absent
   * the global `sash_id` control value is used. LEAF-only.
   */
  sashId?: string | number;
  /**
   * Per-leaf FRAME product id resolved for this section's own system (a Slidding
   * section references a sliding frame product, a Casement section a casement frame
   * product). Captured per section so the backend can cost each section by its own
   * system. When absent the global `product_id` control value is used. LEAF-only.
   */
  productId?: string | number;
  /** Present when this node is subdivided; absent for a leaf pane. */
  split?: PaneSplit;
  /** Transient: this node's outer region mm size at last render. */
  _wMm?: number;
  _hMm?: number;
}
@Component({
  selector: 'app-sub-quotation-design',
  templateUrl: './sub-quotation-design.component.html',
  styleUrls: ['./sub-quotation-design.component.scss'],
})
export class SubQuotationDesignComponent
  implements AfterViewInit, OnDestroy
{
  /**
   * Backing reference for the MOST RECENTLY created form-control subscription.
   * The two "temporarily detach" spots (patchFormValues / _formValueChanges)
   * read & unsubscribe THIS one only, preserving their existing semantics.
   */
  private _lastFormSub: Subscription | undefined;
  /**
   * Aggregate of EVERY form-control valueChanges subscription ever created, so
   * ngOnDestroy can tear them all down (fixes the long-standing leak where only
   * the last `formValueChangesSubscription` was ever unsubscribed).
   */
  private _formSubscriptions = new Subscription();
  /**
   * Single debounced cost-recalc stream. Every change calls `_costTrigger$.next()`
   * (via `_manageProduct`); the subscription set up in ngAfterViewInit collapses
   * bursts (debounceTime) and cancels any in-flight request (switchMap) so rapid
   * edits produce at most ONE `manage-product` POST ~400ms after the user pauses.
   */
  private _costTrigger$ = new Subject<void>();
  private _costSubscription: Subscription | undefined;
  /**
   * Assigning to `formValueChangesSubscription` keeps "last sub" behaviour for the
   * temporary-detach spots AND registers the sub with `_formSubscriptions` for
   * destroy-time cleanup. Zero changes needed at the ~16 assignment call-sites.
   */
  private get formValueChangesSubscription(): Subscription | undefined {
    return this._lastFormSub;
  }
  private set formValueChangesSubscription(sub: Subscription | undefined) {
    this._lastFormSub = sub;
    if (sub) {
      this._formSubscriptions.add(sub);
    }
  }
  edit: boolean = false;
  price: number = 0;
  quotationId: string = '';
  submitted: boolean = false;
  public circleIcon = cilLoopCircular;
  windowFrame: WindowFrame;
  /**
   * Table variables start
   */
  costheadInfo: any[] = [];
  inputValue: string = '';
  /**
   * Table variables end
   */
  /**
   * Design variables start
   */
  stage: Konva.Stage;
  layer = new Konva.Layer();
  @ViewChild('design') container: ElementRef;
  rectSelected: boolean = false;
  /**
   * Design variables end
   */
  /**
   * Form variables start
   */
  form: FormGroup;
  designSpecificationForm: FormGroup;
  designSpecArray: any[] = [];
  /**
   * Form variables end
   */
  /**
   * Dropdown variables start
   */
  dropdowns: IAllDropDownsDto = new AllDropdowns();
  categoryList: string[] = [];
  colors: IProfileColorDto[] = [];
  typeList: string[] = [];
  glassList: IMasterListDto[];
  profileList: IProfileDropdown[] = [];
  mullionList: IProfileDropdown[] = [];
  handleList: IMasterListDto[] = [];
  ventilationTypes: IMasterListDto[] = [];
  sliddingTypes: string[] = [];
  hingesType: string[] = [];
  sashList: IProfileDropdown[] = [];
  casementTypes: string[] = [];
  palla_type_openable: number[];
  palla_type_slidding: number[];
  openningDirections: IOpenDirectionDrpDto[];
  product_id: any;
  isMullion: boolean;
  isAddMullion: boolean;
  mullionForm: FormGroup;
  selectedRect: Konva.Rect;
  mullionSubmitted: boolean;
  ratio: number;
  frameGapPx: number;  // frame/sash inset in pixels = frameThicknessMm * ratio, floored at minFramePx
  /** Phase 3: when true (default), draw frame/mullion profiles as mitred polygon bands.
   *  Set to false to revert to plain rectangles as a fallback. */
  readonly usePolygonRenderer = true;
  mullionArray: any[] = [];
  /**
   * State-driven model. `rootPane` is the single source of truth for the
   * window subdivision; `selectedPaneId` tracks the currently highlighted leaf
   * by node id (survives redraws — Konva shapes are recreated each `_redraw()`).
   */
  rootPane: PaneNode;
  selectedPaneId: string | null = null;
  private _paneIdSeq = 0;
  /** Glass rect of the root leaf at last render (for corner connectors / frame-click). */
  private _rootGlassRect: Konva.Rect | null = null;
  pallaSelected: boolean;
  pallaForm: FormGroup;
  showHeightWidthOption: boolean;
  ouerRect: Konva.Rect;
  quotDetails: IResponseDtoOfProduct;
  index_no: string;
  /**
   * Dropdown variables end
   */
  constructor(
    private _fb: FormBuilder,
    private _activeRoute: ActivatedRoute,
    private _designService: FinalService,
    private _konvaDesignService: KonvaElementService,
    private _dataService: QuotationService,
    private _dropdownService: DropdownService,
    private confirmationDialogService: ConfirmationDialogService,
    private _router: Router,
    private _profileService: ProfileService,
    private _toastService: ToastService,
    private _cdr: ChangeDetectorRef
  ) {
    this._setUpData();
  }

  public handleFormModal(event: any) {
    console.log(event);
    this.isMullion = event;
    if (this.isMullion == true) {
      this.mullionForm = this._mullionFormInit();
      this.mullionForm.updateValueAndValidity();
    }
  }

  public submitMullion() {
    this.mullionSubmitted = true;
    const node = this.selectedPaneId
      ? this._findPane(this.selectedPaneId, this.rootPane)
      : null;
    if (this.mullionForm.valid && node && !node.split) {
      // State mutation: split the selected LEAF into two glazed children with a
      // single mullion bar between them. No imperative shape juggling — the next
      // `_redraw()` renders the whole window from this tree, so the mullion is
      // drawn exactly once and can never duplicate or orphan on later edits.
      const direction =
        this.mullionForm.value.direction === 'horizontal'
          ? 'horizontal'
          : 'vertical';
      const profileId = this.mullionForm.value.profile_id;
      const selectedMullionProfile = this.mullionList?.find(
        (p) => String(p.id) === String(profileId)
      );
      const mullionWidthMm =
        selectedMullionProfile?.face_width_mm ?? designConst.mullionWidthMm;
      // Children are plain glazed leaves; a framed parent keeps its own sash band.
      // SUPER SYSTEM: seed each new section with the current casement type + sash
      // id (alongside direction / handle / hinges) so a freshly-split window keeps
      // the inherited config until the user re-configures an individual section.
      const baseDir = this.df['opening_direction']?.value || 'Left';
      const baseHandle = this.df['handle_id']?.value;
      const baseHinges = this.df['hinges_type']?.value;
      const baseCasement = this.df['casement_type']?.value;
      const baseSash = this.df['sash_id']?.value;
      // SUPER SYSTEM: seed each new section with the current SYSTEM (category) and
      // its frame product so a freshly-split window keeps the inherited system until
      // the user re-configures an individual section to a different one.
      const baseCategory = this.df['category_type']?.value;
      const baseProduct = this.df['product_id']?.value;
      node.split = {
        direction,
        kind: 'mullion',
        profileId,
        mullionWidthMm,
        children: [
          this._newLeaf(
            false,
            baseDir,
            baseHandle,
            baseHinges,
            baseCasement,
            baseSash,
            baseCategory,
            baseProduct
          ),
          this._newLeaf(
            false,
            baseDir,
            baseHandle,
            baseHinges,
            baseCasement,
            baseSash,
            baseCategory,
            baseProduct
          ),
        ],
        fractions: [0.5, 0.5],
      };
      this.isAddMullion = false;
      this.isMullion = false;
      this.rectSelected = false;
      this.pallaSelected = false;
      this.showHeightWidthOption = false;
      this.selectedPaneId = null;
      this.mullionForm.reset();
      this.mullionForm.updateValueAndValidity();
      this._redraw();
    } else {
      if (node) {
        this._toastService.showError('Please fill all the required fields');
      } else {
        this._toastService.showError('Please select area first');
      }
    }
    this._manageProduct();
  }

  public cancelMullion() {
    this.isMullion = false;
  }

  /**
   * Lifecycle method start
   */
  ngAfterViewInit() {
    // this.
    //  = [this.designSpecificationForm.value];

    // Set up the debounced/race-free cost stream FIRST so any `_costTrigger$.next()`
    // emitted while patching/initialising below is honoured (Subject does not replay).
    this._setupCostStream();

    if (this.edit) {
      this.patchFormValues();

      console.log(this.form.value);
    }
    this._manageProduct();
    this.stage = new Konva.Stage({
      container: this.container.nativeElement,
      width: 700,
      height: 800,
    });
    console.log(this.stage);
    this.stage.add(this.layer);
    this._updateCanvas();
    // price/costheadInfo were set synchronously above after the view was
    // checked (NG0100 on edit load); reconcile the bindings in this cycle
    this._cdr.detectChanges();
  }

  /**
   * One-time setup of the live cost-preview stream.
   *
   * - `debounceTime(400)`  : collapses a burst of rapid edits into ONE call,
   *    fired ~400ms after the user stops changing things.
   * - `switchMap`          : cancels any still-in-flight `manage-product` POST
   *    when a newer change arrives, killing the request race.
   * - `catchError(of(null))` inside the switchMap keeps the OUTER stream alive
   *    if a request fails/cancels — price is simply left unchanged on error.
   *
   * The response handling is byte-for-byte the same mapping the old synchronous
   * `_manageProduct()` did (costheadInfo rebuild + per-product rows + total).
   */
  private _setupCostStream() {
    this._costSubscription = this._costTrigger$
      .pipe(
        debounceTime(400),
        switchMap(() =>
          this._dataService
            .quotationManageProduct(this._buildCostData())
            .pipe(catchError(() => of(null)))
        )
      )
      .subscribe((res: any) => {
        if (res && res.success) {
          this.costheadInfo = res.data.costhead_information.costhead;
          res.data.product_information.forEach((e: any) => {
            let data: any = {
              id: e.id,
              product_no: e.id,
              name: `${e.profile_code} - ${e.profile_name}`,
              type: e.category,
              costhead: e.category,
              cost: e.rate_meter,
              totalCost: e.totalCost,
              quantity: e.quantity,
            };
            this.costheadInfo.push(data);
          });
          this.price = res.data.total;
        }
      });
  }

  ngOnDestroy() {
    // Tear down the cost stream and every form-control subscription. Completing
    // the Subject releases the debounce/switchMap pipeline; unsubscribing the
    // aggregate kills all valueChanges subs (the previously leaked ones too).
    this._costTrigger$.complete();
    this._costSubscription?.unsubscribe();
    this._formSubscriptions.unsubscribe();
  }

  private patchFormValues() {
    // Unsubscribe from form value changes temporarily
    if (this.formValueChangesSubscription) {
      this.formValueChangesSubscription.unsubscribe();
    }

    this.form.patchValue({
      quatation_id: this.quotDetails.quatation.id,
      quatation_product_id: this.quotDetails.id,
      is_saved: false,
      quantity: this.quotDetails.quantity,
      color: this.colors.find(
        (e) =>
          e.id === this.quotDetails.costhead_information.old_post_data.color_id
      ),
      width: this.quotDetails.width,
      height: this.quotDetails.height,
      profile_color: '#ffffff',
    });
    this.designSpecificationForm.patchValue(
      this.quotDetails.costhead_information.old_post_data
    );
    this.costheadInfo = this.quotDetails.costhead_information.costhead;
    this.quotDetails.product_information.forEach((e) => {
      let data: any = {
        id: e.id,
        product_no: e.id,
        name: `${e.profile_code} - ${e.profile_name}`,
        type: e.category,
        costhead: e.category,
        cost: e.rate_meter,
        totalCost: e.totalCost,
        quantity: e.quantity,
      };
      this.costheadInfo.push(data);
    });
    this.price = this.quotDetails.total;
  }
  /**
   * Lifecycle method end
   */

  /**
   * Form Getters start
   */

  get f() {
    return this.form.controls;
  }

  get df() {
    return this.designSpecificationForm.controls;
  }

  get mf() {
    return this.mullionForm.controls;
  }

  get pf() {
    return this.pallaForm.controls;
  }
  /**
   * Form Getters end
   */

  /**
   *
   * @param table Table Object
   * Table functions start
   */
  public clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }

  public addMullion() {
    console.log('mullion');
    this.isMullion = true;
  }

  private _mullionFormInit(): FormGroup {
    const fg = this._fb.group({
      profile_id: new FormControl('', [Validators.required]),
      direction: new FormControl('', [Validators.required]),
      length: new FormControl(''),
    });

    return fg;
  }
  public customSort(event: SortEvent) {
    sharedClasses.customSort(event);
  }

  /**
   * Table functions end
   */

  /**
   * Submit and Cancel Function start
   */

  public resetDesign() {
    this.confirmationDialogService.confirm(
      'Are you sure!',
      'Are you sure you want to Reset the design ? ',
      'pi-info-circle',
      () => {
        this.clearLayerChildren();
        this.form = this._initForm();
        this.rectSelected = false;
        // Reset the state model back to a single un-split, un-framed pane.
        this.rootPane = this._newLeaf(false);
        this.selectedPaneId = null;
        this.mullionArray = [];
        this.pallaSelected = false;
        this.designSpecificationForm = this._designSpecFormInit();
        // this.designSpecArray = [this.designSpecificationForm.value];
        this._profileList();
        this._manageProduct();
        this.stage = new Konva.Stage({
          container: this.container.nativeElement,
          width: 700,
          height: 800,
        });
        this.stage.add(this.layer);
        this.isAddMullion = false;
        this._redraw();
      },
      () => {
        console.log('Action rejected');
      }
    );
  }

  public submit() {
    this.submitted = true;
    if (this.form.invalid) {
      this._toastService.showError('Please fix the highlighted fields before saving.');
    } else if (this.rectSelected) {
      this._toastService.showError('Please complete the design first.');
    } else {
      let data = this.form.getRawValue();
      data.mullion = this.mullionArray;
      // SUPER SYSTEM cost contract: `parts` is now built PER SECTION from the leaf
      // tree so the backend costs each section by its own system. For a single
      // un-split window this is byte-identical to the legacy single-part array, so
      // existing single-window pricing is unchanged.
      data.parts = this._buildParts(this.rootPane);
      // SUPER SYSTEM (additive, backward compatible): per-section configuration
      // walked from the leaf tree so the backend can later cost each section
      // independently. Existing `mullion` key is untouched.
      data.sections = this._buildSections(this.rootPane);
      data.is_saved = true;
      data.quatation_id = this.quotationId ? this.quotationId : null;
      data.image = this.stage.toDataURL();
      this._dataService.quotationManageProduct(data).subscribe((res) => {
        if (res.success) {
          this.costheadInfo = res.data.costhead_information.costhead;
          this.price = res.data.total;
          this._router.navigate([`/quotation/detail/${this.quotationId}`]);
          this._toastService.showSuccess(res.message);
        }
      });
    }
  }

  public toggleWarningModal() {
    if (this.form.dirty && this.form.touched) {
      this.confirmationDialogService.confirm(
        'Are you sure!',
        'Are you sure you want to Cancel ? ',
        'pi-info-circle',
        () => {
          this._router.navigate([`/quotation/detail/${this.quotationId}`]);
        },
        () => {
          console.log('Action rejected');
        }
      );
    } else {
      this._router.navigate([`/quotation/detail/${this.quotationId}`]);
    }
  }

  public saveDesign() {
    if (this.designSpecificationForm.invalid) {
      this._toastService.showError(
        'Please fill all the required fields first.'
      );
      return;
    }
    this.designSpecArray[0] = this.designSpecificationForm.getRawValue();
    this._deselectPane();
  }

  /**
   * Submit and Cancel Function end
   */

  /**
   * Data initialization start
   */
  private _setUpData() {
    const data = this._activeRoute.snapshot.data;
    this.dropdowns = data['dropdowns'];
    this.edit = data['edit'];
    this.profileList = data['profileList'];
    this.glassList = this.dropdowns.costhead;
    this.categoryList = this.dropdowns.category;
    this.typeList = this.dropdowns.product_type;
    this.glassList = this.dropdowns.costhead;
    this.sliddingTypes = this.dropdowns.slidding_type;
    this.hingesType = this.dropdowns.hinges_type;
    this.casementTypes = this.dropdowns.casement_type;
    this.palla_type_openable = this.dropdowns.palla_type_openable;
    this.palla_type_slidding = this.dropdowns.palla_type_slidding;
    this.openningDirections = this.dropdowns.opening_direction;
    this.colors = this.dropdowns.profile_color;
    this.mullionList = data['mullionList'];
    this.quotDetails = data['details'];
    this.quotationId = this._activeRoute.snapshot.paramMap.get('id') || '';
    this.product_id = this._activeRoute.snapshot.paramMap.get('subId') || '';
    this.index_no = this._activeRoute.snapshot.paramMap.get('index') || '';
    this.form = this._initForm();
    this.designSpecificationForm = this._designSpecFormInit();
    this.mullionForm = this._mullionFormInit();
    this.pallaForm = this._initPallaForm();
    // Initial state: a single un-framed glazed pane filling the frame interior.
    this.rootPane = this._newLeaf(false);
  }
  /**
   * Data initialization end
   */
  /**
   * Form Function start
   */
  private _initForm() {
    let fg = this._fb.group({
      quatation_id: new FormControl(),
      quatation_product_id: new FormControl(
        this.product_id ? this.product_id : ''
      ),
      is_saved: new FormControl(false),
      // quantity is a bill multiplier server-side: whole positive number,
      // bounded like the API guard (audit H5).
      quantity: new FormControl(1, [
        Validators.required,
        Validators.pattern(/^\d+$/),
        Validators.min(1),
        Validators.max(10000),
      ]),
      color: new FormControl(
        this.colors.find((e) => e.is_default),
        [Validators.required]
      ),
      width: new FormControl(1500, [
        Validators.required,
        Validators.min(200),
        Validators.max(5800),
      ]),
      height: new FormControl(1200, [
        Validators.required,
        Validators.min(200),
        Validators.max(5800),
      ]),
      profile_color: new FormControl('#ffffff', [Validators.required]),
      mullion: new FormControl([]),
      parts: new FormControl([]),
      image: new FormControl(),
    });
    this._formValueChanges(fg);
    return fg;
  }

  private _designSpecFormInit(obj?: any) {
    const fg = this._fb.group({
      designId: new FormControl(),
      category_type: new FormControl('Casement', [Validators.required]),
      mullion_quantity: new FormControl(),
      product_id: new FormControl(this.profileList[0].id, [
        Validators.required,
      ]),
      color_id: new FormControl(this.f['color'].value.id),
      sash_id: new FormControl(''),
      casement_type: new FormControl('Fixed'),
      palla_type: new FormControl(),
      hinges_type: new FormControl(),
      opening_direction: new FormControl('Left'),
      glazing_bars_vertical: new FormControl(0),
      glazing_bars_horizontal: new FormControl(0),
      is_track: new FormControl(),
      product_type: new FormControl('Window', [Validators.required]),
      handle_id: new FormControl(),
      is_cupler: new FormControl(false),
      is_louvers: new FormControl(false),
      is_lshape: new FormControl(false),
      height: new FormControl(this.f['height'].value),
      width: new FormControl(this.f['width'].value),
      total: new FormControl(),
      glazz_id: new FormControl(this.glassList[0].id),
      ventilation_id: new FormControl(),
      ventilation_height: new FormControl(),
      ventilation_width: new FormControl(),
      ventilation_glazz_id: new FormControl(),
      fly_mesh: new FormControl(),
      palla: new FormControl(),
    });
    if (obj) {
      fg.patchValue(obj);
    }
    this._designFormValueChange(fg);
    return fg;
  }

  private _formValueChanges(fg: FormGroup) {
    const height = fg.get('height');
    const width = fg.get('width');
    const color = fg.get('color');
    const profile_color = fg.get('profile_color');
    const quantity = fg.get('quantity');
    const handleValueChange = (res: any) => {
      if (!res) return;
      // Clear before redraw so pane rects don't accumulate (P0.4)
      this.clearLayerChildren();
      this._updateCanvas(true);
      this._manageProduct();
    };
    if (this.formValueChangesSubscription) {
      this.formValueChangesSubscription.unsubscribe();
    }
    // height?.valueChanges.subscribe(handleValueChange);
    // width?.valueChanges.subscribe(handleValueChange);
    this.formValueChangesSubscription = height?.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (res) {
          this.clearLayerChildren();
          this._updateCanvas(true);
          this._manageProduct();
        }
      });
    this.formValueChangesSubscription = width?.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (res) {
          this.clearLayerChildren();
          this._updateCanvas(true);
          this._manageProduct();
        }
      });
    this.formValueChangesSubscription = quantity?.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (res) {
          this._manageProduct();
        }
      });
    this.formValueChangesSubscription = color?.valueChanges
      .pipe(debounceTime(300))
      .subscribe((value: any) => {
        if (value.id) {
          profile_color?.patchValue(value.color_code);
          this.clearLayerChildren();
          this._updateCanvas(true);
          this._manageProduct();
          // handleValueChange(value);
        }
      });
  }

  private _designFormValueChange(fg: FormGroup) {
    const casementTypeControl = fg.controls['casement_type'];
    const sashIdControl = fg.controls['sash_id'];
    const pallaTypeControl = fg.controls['palla_type'];
    const hingesTypeControl = fg.controls['hinges_type'];
    const isTrackControl = fg.controls['is_track'];
    const handleIdControl = fg.controls['handle_id'];
    const category = fg.controls['category_type'];
    const glass_id = fg.controls['glazz_id'];
    const fly_mesh = fg.controls['fly_mesh'];
    const product_type = fg.controls['product_type'];
    const opening_direction = fg.controls['opening_direction'];
    const glazingBarsV = fg.controls['glazing_bars_vertical'];
    const glazingBarsH = fg.controls['glazing_bars_horizontal'];
    [glazingBarsV, glazingBarsH].forEach((ctrl) => {
      this.formValueChangesSubscription = ctrl.valueChanges
        .pipe(debounceTime(300))
        .subscribe(() => {
          // Redraw so glazing bars update live.
          this.clearLayerChildren();
          this._updateCanvas(true);
        });
    });
    // Opening direction is now per-selected-pane. When a leaf is selected, the
    // change targets THAT pane; with no selection it falls back to the legacy
    // whole-window behaviour (apply to every leaf). Patching this control to
    // mirror a freshly-selected pane uses `emitEvent: false`, so it never
    // re-enters here.
    this.formValueChangesSubscription = opening_direction.valueChanges
      .pipe(debounceTime(300))
      .subscribe((val) => {
        const leaf = this._selectedLeaf();
        if (leaf) {
          leaf.openingDirection = val;
          this._redraw();
        } else {
          this._applyDirectionToAllLeaves(this.rootPane, val);
          this.clearLayerChildren();
          this._updateCanvas(true);
        }
      });
    this.formValueChangesSubscription = category.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (!res) {
          return;
        }
        // SUPER SYSTEM per-section path: a SECTION is selected, so switch ONLY that
        // section's system (Casement <-> Slidding). Critically, do NOT call
        // pallaTypeControl.setValue / _applyPallaDivisions or any window-level reset
        // here — those REBUILD the whole pane tree (wiping the mullion split and
        // every other section's config), which is exactly what made one section's
        // system flip the entire window. We mutate just this leaf, load the
        // per-section lists so the user can configure it, resolve a valid frame
        // product for the new system, then redraw.
        const selected = this._selectedLeaf();
        if (selected) {
          selected.category = res === 'Slidding' ? 'Slidding' : 'Casement';
          if (res === 'Slidding') {
            // A sliding section has no casement type; default to a sensible sash.
            selected.casementType = undefined;
          } else {
            // A casement section starts Fixed (plain glass) until made Openable.
            selected.casementType = 'Fixed';
          }
          // Force this section to re-resolve its own sash for the new system.
          selected.sashId = undefined;
          // Load the per-section lists (frame / sash / handle) for the new system
          // AND resolve this section's own frame product (#5) so the backend can
          // cost it by its own system.
          this._resolveSectionProduct(selected);
          this._sashList();
          this._handleList();
          this._manageProduct();
          this.clearLayerChildren();
          this._updateCanvas(true);
          return;
        }
        // WHOLE-WINDOW path (nothing selected): legacy window-level behaviour.
        if (res) {
          casementTypeControl.setValue(res === 'Casement' ? 'Fixed' : '');
          casementTypeControl.setValidators(
            res === 'Casement' ? [Validators.required] : []
          );
          if (
            (res === 'Casement' && casementTypeControl.value === 'Openable') ||
            res === 'Slidding'
          ) {
            this.isAddMullion = false;
            sashIdControl.setValidators([Validators.required]);
            if (
              res === 'Casement' &&
              casementTypeControl.value === 'Openable'
            ) {
              pallaTypeControl.setValue(1);
            } else if (res === 'Slidding') {
              pallaTypeControl.setValue(2);
            }
            pallaTypeControl.setValidators([Validators.required, Validators.min(1)]);
            handleIdControl.setValidators([Validators.required]);
            this._profileList();
            this._sashList();
            this._handleList();
          } else {
            // "Add Mullion" must only appear when a pane is actually selected
            // on the canvas (set in _onPaneClick), not globally on a form
            // change. Keep it off here so it isn't visible before selection.
            this.isAddMullion = false;
            [
              sashIdControl,
              pallaTypeControl,
              hingesTypeControl,
              isTrackControl,
              handleIdControl,
            ].forEach((control) => {
              control.setValue('');
              control.clearValidators();
            });
          }

          if (res === 'Slidding') {
            pallaTypeControl.setValue(2);
            pallaTypeControl.setValidators([Validators.required, Validators.min(1)]);
            isTrackControl.setValue('2 Track');
            isTrackControl.setValidators([Validators.required]);
            hingesTypeControl.setValue('');
            hingesTypeControl.clearValidators();
            hingesTypeControl.updateValueAndValidity();
          }

          if (res === 'Casement' && casementTypeControl.value === 'Openable') {
            pallaTypeControl.setValue(1);
            pallaTypeControl.setValidators([Validators.required, Validators.min(1)]);
            hingesTypeControl.setValidators([Validators.required]);
          }
          [
            casementTypeControl,
            sashIdControl,
            pallaTypeControl,
            hingesTypeControl,
            isTrackControl,
            handleIdControl,
          ].forEach((control) => control.updateValueAndValidity());
        }
        this._manageProduct();
        // Clear before redraw so pane rects don't accumulate (P0.4)
        this.clearLayerChildren();
        this._updateCanvas(true);
      });

    this.formValueChangesSubscription = casementTypeControl.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        const leaf = this._selectedLeaf();

        // SUPER SYSTEM per-section path: a section is selected, so change ONLY
        // that section's casement type. Critically, do NOT touch palla_type or
        // run any window-level reset — pallaTypeControl.setValue() fires the
        // palla handler which REBUILDS the whole pane tree (wiping the mullion
        // split and every other section's config). That is what made one
        // section's "Openable" flip the entire window.
        if (leaf) {
          if (res === 'Fixed' || res === 'Openable') {
            leaf.casementType = res;
            leaf.sashId = sashIdControl.value;
          }
          if (res === 'Openable') {
            // Load lists so the user can pick this section's sash/handle/hinge.
            this._profileList();
            this._sashList();
            this._handleList();
          }
          this._manageProduct();
          this.clearLayerChildren();
          this._updateCanvas(true);
          return;
        }

        // WHOLE-WINDOW path (no section selected): legacy behaviour.
        if (res) {
          if (category.value === 'Casement' && res === 'Openable') {
            pallaTypeControl.setValue(1);
            pallaTypeControl.setValidators([Validators.required, Validators.min(1)]);
            this._profileList();
            this._sashList();
            this._handleList();
            [
              sashIdControl,
              hingesTypeControl,
              isTrackControl,
              handleIdControl,
            ].forEach((control) => {
              control.setValue('');
              control.clearValidators();
            });
            hingesTypeControl.setValidators([Validators.required]);
          } else {
            this._profileList();
          }
          [
            sashIdControl,
            pallaTypeControl,
            hingesTypeControl,
            isTrackControl,
            handleIdControl,
          ].forEach((control) => control.updateValueAndValidity());
        }
        if (res === 'Fixed' || res === 'Openable') {
          this._applyCasementToAllLeaves(this.rootPane, res);
        }
        this._manageProduct();
        this.clearLayerChildren();
        this._updateCanvas(true);
      });

    this.formValueChangesSubscription = sashIdControl.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (res) {
          // SUPER SYSTEM: sash id is per-selected-section. With a leaf selected
          // the change captures THAT section's sash; with no selection it falls
          // back to applying it to every leaf (legacy whole-window).
          const leaf = this._selectedLeaf();
          if (leaf) {
            leaf.sashId = res;
          } else {
            this._applySashToAllLeaves(this.rootPane, res);
          }
          this._manageProduct();
        }
      });

    this.formValueChangesSubscription = pallaTypeControl.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        const n = Number(res) || 0;
        const leaf = this._selectedLeaf();
        if (leaf) {
          // PER-SECTION: divide ONLY the selected section into n panes; do NOT
          // rebuild the whole tree (that would wipe the mullion split + other
          // sections). The sub-panes inherit THIS section's system/type.
          this._applyPallaToLeaf(leaf, n);
        } else {
          // Whole-window legacy: palla defines the top-level subdivision and
          // resets any manual mullions (intended when no section is selected).
          this._applyPallaDivisions(n);
        }
        this._redraw();
        this._manageProduct();
      });
    this.formValueChangesSubscription = isTrackControl.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (res) {
          if (res === '2.5 Track' || res === '3 Track') {
            fly_mesh.setValue(true);
            fly_mesh.setValidators([Validators.required]);
          } else {
            fly_mesh.setValue('');
            fly_mesh.clearValidators();
          }
          fly_mesh.updateValueAndValidity();
          this._profileList();
          this._sashList();
          this._manageProduct();
        }
      });
    this.formValueChangesSubscription = fly_mesh.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        // Clear before redraw so pane rects don't accumulate (P0.4)
        this.clearLayerChildren();
        this._updateCanvas(true);
        this._manageProduct();
      });
    // Handle is now per-selected-pane (VISUAL). With a leaf selected the change
    // targets THAT pane's glyph; with no selection it falls back to the legacy
    // whole-window behaviour (apply to every leaf). The save payload still uses
    // the form's handle_id, so _manageProduct() runs regardless.
    this.formValueChangesSubscription = handleIdControl.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (res) {
          const leaf = this._selectedLeaf();
          if (leaf) {
            leaf.handleId = res;
            this._redraw();
          } else {
            this._applyHandleToAllLeaves(this.rootPane, res);
            this.clearLayerChildren();
            this._updateCanvas(true);
          }
          this._manageProduct();
        }
      });
    this.formValueChangesSubscription = glass_id.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (res) {
          this._manageProduct();
          // Clear before redraw so pane rects don't accumulate (P0.4)
          this.clearLayerChildren();
          this._updateCanvas(true);
        }
      });
    // (Removed a duplicate handle_id valueChanges subscription that only called
    // _manageProduct(): the per-pane handle handler above already runs the
    // leaf-vs-whole-window apply AND _manageProduct(), so the second subscription
    // was redundant — it double-fired the backend cost call and muddied the
    // deterministic per-pane behaviour. One handler per control now.)
    // Hinge type is now per-selected-pane (VISUAL: drives hinge tick count). Same
    // leaf-vs-whole-window fallback as opening_direction / handle_id.
    this.formValueChangesSubscription = hingesTypeControl.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (res) {
          const leaf = this._selectedLeaf();
          if (leaf) {
            leaf.hingesType = res;
            this._redraw();
          } else {
            this._applyHingesToAllLeaves(this.rootPane, res);
            this.clearLayerChildren();
            this._updateCanvas(true);
          }
          this._manageProduct();
        }
      });
    this.formValueChangesSubscription = product_type.valueChanges
      .pipe(debounceTime(300))
      .subscribe((res) => {
        if (res) {
          this._manageProduct();
          this._handleList();
        }
      });
  }
  /**
   * Form Function end
   */

  /**
   * Api Calls start
   */
  private _manageProduct() {
    // SYNCHRONOUS part — must run immediately on every change so the design
    // specification form + designSpecArray stay in lock-step with the form.
    let data = this.form.getRawValue();
    this.designSpecificationForm.get('height')?.setValue(data.height);
    this.designSpecificationForm.get('width')?.setValue(data.width);
    this.designSpecificationForm.get('color')?.setValue(data.color);
    // if (!this.designSpecArray.length) {
    this.designSpecificationForm.get('color_id')?.patchValue(data.color.id);
    this.designSpecArray[0] = this.designSpecificationForm.value;
    // }
    // ASYNC part — defer the expensive (~2s) cost API to the single debounced,
    // race-free stream (see `_setupCostStream`). Older in-flight calls are
    // cancelled and bursts collapse into one POST after the user pauses.
    this._costTrigger$.next();
  }

  /**
   * Builds the live-cost-preview request payload. Identical shape to what
   * `_manageProduct()` used to send (and to `submit()` minus the save fields):
   * the raw form value plus `mullion` and per-section `parts`.
   *
   * Live cost preview must price PER-SECTION (same payload as submit()),
   * else a composite/cabin window is priced as one part and the total
   * never reflects the per-section systems.
   */
  private _buildCostData() {
    let data = this.form.getRawValue();
    data.mullion = this.mullionArray;
    data.parts = this._buildParts(this.rootPane);
    return data;
  }

  private _profileList() {
    const query = {
      category_name: this.df['category_type'].value,
      track: this.df['is_track'].value,
      sub_category_name: 'Frame',
      casement_type: this.df['casement_type'].value,
      product_type: this.df['product_type'].value,
    };
    this._profileService.productDropdown(query).subscribe((res) => {
      if (res.success) {
        this.profileList = res.data;
        this.df['product_id'].patchValue(this.profileList[0].id);
        this._manageProduct();
      }
    });
  }

  private _sashList() {
    const query = {
      category_name: this.df['category_type'].value,
      track: this.df['is_track'].value,
      sub_category_name: 'Sash',
      casement_type: this.df['casement_type'].value,
      product_type: this.df['product_type'].value,
    };
    this._profileService.productDropdown(query).subscribe((res) => {
      if (res.success) {
        this.sashList = res.data;
        if (this.edit) {
          this.df['sash_id'].patchValue(
            this.quotDetails.costhead_information.old_post_data.sash_id
          );
        } else {
          this.df['sash_id'].patchValue(
            this.sashList[0] ? this.sashList[0].id : ''
          );
        }
      }
    });
  }

  private _handleList() {
    const query = {
      costhead: 'Handle',
      type: '',
      category: this.df['category_type'].value,
      search: '',
    };
    this._dropdownService.getCostHeadDataDropdown(query).subscribe((res) => {
      if (res.success) {
        this.handleList = res.data;
      }
    });
  }

  /**
   * SUPER SYSTEM per-section product resolver. Loads the FRAME product list for a
   * single section's OWN system (its `category` / `casementType`, falling back to
   * the global controls) and stores the resolved frame `product_id` on the leaf so
   * the backend can cost that section by its own system (a Slidding section gets a
   * sliding frame product, a Casement section a casement frame product). The loaded
   * list is also surfaced through `profileList` / the `product_id` control so the
   * user can immediately pick a different frame for the selected section. Defaults
   * sensibly to the first frame of that system. Redraws + re-prices on success.
   */
  private _resolveSectionProduct(leaf: PaneNode) {
    const query = {
      category_name: leaf.category ?? this.df['category_type'].value,
      track: this.df['is_track'].value,
      sub_category_name: 'Frame',
      casement_type: leaf.casementType ?? this.df['casement_type'].value,
      product_type: this.df['product_type'].value,
    };
    this._profileService.productDropdown(query).subscribe((res) => {
      if (res.success && res.data && res.data.length) {
        this.profileList = res.data;
        leaf.productId = res.data[0].id;
        this.df['product_id'].patchValue(res.data[0].id);
        this._redraw();
        this._manageProduct();
      }
    });
  }
  /**
   * Api Calls end
   */

  /**
   * Design Functions start
   */

  /**
   * Backwards-compatible entry point. The canvas is now fully state-driven, so
   * every former call site (form value changes, lifecycle, reset) simply asks
   * for a full redraw from the {@link rootPane} state. The `change` flag is no
   * longer meaningful — a redraw always rebuilds the entire window — but the
   * parameter is kept so existing callers compile unchanged.
   */
  private _updateCanvas(_change?: boolean) {
    this._redraw();
  }

  // ===========================================================================
  //  State-driven rendering core
  // ===========================================================================

  /**
   * Create a fresh leaf pane node with a unique id, optionally seeded with the
   * current opening direction, handle and hinge type so a freshly-divided sash
   * inherits whatever the form currently shows (mirrors the openingDirection
   * seeding done for palla / mullion children).
   */
  private _newLeaf(
    framed: boolean,
    openingDirection?: string,
    handleId?: string | number,
    hingesType?: string,
    casementType?: 'Fixed' | 'Openable',
    sashId?: string | number,
    category?: 'Casement' | 'Slidding',
    productId?: string | number
  ): PaneNode {
    return {
      id: `p${++this._paneIdSeq}`,
      framed,
      openingDirection,
      handleId,
      hingesType,
      casementType,
      sashId,
      category,
      productId,
    };
  }

  /** Recursively set the opening/slide direction on every leaf in the tree. */
  private _applyDirectionToAllLeaves(node: PaneNode, direction: string) {
    if (!node.split) {
      node.openingDirection = direction;
      return;
    }
    node.split.children.forEach((c) =>
      this._applyDirectionToAllLeaves(c, direction)
    );
  }

  /** Recursively set the handle id on every leaf in the tree (legacy mode). */
  private _applyHandleToAllLeaves(node: PaneNode, handleId: string | number) {
    if (!node.split) {
      node.handleId = handleId;
      return;
    }
    node.split.children.forEach((c) =>
      this._applyHandleToAllLeaves(c, handleId)
    );
  }

  /** Recursively set the hinge type on every leaf in the tree (legacy mode). */
  private _applyHingesToAllLeaves(node: PaneNode, hingesType: string) {
    if (!node.split) {
      node.hingesType = hingesType;
      return;
    }
    node.split.children.forEach((c) =>
      this._applyHingesToAllLeaves(c, hingesType)
    );
  }

  /** Recursively set the casement type on every leaf in the tree (legacy mode). */
  private _applyCasementToAllLeaves(
    node: PaneNode,
    casementType: 'Fixed' | 'Openable'
  ) {
    if (!node.split) {
      node.casementType = casementType;
      return;
    }
    node.split.children.forEach((c) =>
      this._applyCasementToAllLeaves(c, casementType)
    );
  }

  /** Recursively set the sash id on every leaf in the tree (legacy mode). */
  private _applySashToAllLeaves(node: PaneNode, sashId: string | number) {
    if (!node.split) {
      node.sashId = sashId;
      return;
    }
    node.split.children.forEach((c) => this._applySashToAllLeaves(c, sashId));
  }

  /**
   * SUPER SYSTEM payload: walk every LEAF in the tree and produce one descriptor
   * per section, resolving each per-leaf override against the global form control
   * so every entry is fully populated (legacy whole-window leaves report the
   * global config). `widthMm` / `heightMm` come from the leaf's last-rendered
   * structural mm sizes (`_wMm` / `_hMm`, repopulated on every `_redraw()`), i.e.
   * the TRUE per-section size with frame + mullion faces already deducted. This is
   * ADDITIVE — it never touches the existing `mullion` / `parts` payload keys.
   */
  private _buildSections(node: PaneNode, out: any[] = []): any[] {
    if (!node.split) {
      out.push({
        casementType: node.casementType ?? this.df['casement_type']?.value ?? null,
        sashId: node.sashId ?? this.df['sash_id']?.value ?? null,
        openingDirection:
          node.openingDirection ?? this.df['opening_direction']?.value ?? null,
        handleId: node.handleId ?? this.df['handle_id']?.value ?? null,
        hingesType: node.hingesType ?? this.df['hinges_type']?.value ?? null,
        widthMm: node._wMm != null ? Math.round(node._wMm) : null,
        heightMm: node._hMm != null ? Math.round(node._hMm) : null,
      });
      return out;
    }
    node.split.children.forEach((c) => this._buildSections(c, out));
    return out;
  }

  /**
   * SUPER SYSTEM cost contract: build the `parts` payload with ONE part per LEAF
   * section, each costed by its OWN system (category / casement / sash / frame
   * product / true per-section mm size).
   *
   * BACKWARD COMPATIBILITY (critical): for a SINGLE un-split window (the root is
   * itself a leaf) this returns the legacy single-part array — the full design
   * spec form value, byte-identical to what `designSpecArray[0]` produces today —
   * so existing single-window pricing is completely unchanged. Only a DIVIDED
   * window (mullion / palla split) emits multiple per-section parts.
   */
  private _buildParts(root: PaneNode): any[] {
    // Single un-split window → identical to the legacy `designSpecArray[0]` part.
    if (!root.split) {
      return [this.designSpecificationForm.getRawValue()];
    }
    const parts: any[] = [];
    this._collectLeafParts(root, parts);
    return parts;
  }

  /** Walk every LEAF, pushing one per-section part (see {@link _leafPart}). */
  private _collectLeafParts(node: PaneNode, out: any[]): void {
    if (!node.split) {
      out.push(this._leafPart(node));
      return;
    }
    node.split.children.forEach((c) => this._collectLeafParts(c, out));
  }

  /**
   * One section's cost descriptor. Each field is resolved from the leaf's own
   * per-section value, falling back to the global design-spec control so legacy
   * (unconfigured) sections still report the whole-window config. `height` /
   * `width` are the section's TRUE structural mm size (`_hMm` / `_wMm`,
   * repopulated every `_redraw()` with frame + mullion faces already deducted);
   * `palla_type` is 1 because each section is itself one system/palla.
   */
  private _leafPart(leaf: PaneNode): any {
    const g = this.df;
    // Start from the FULL design-spec form so EVERY field the backend pricing
    // reads is present (mullion_quantity, ventilation_*, product_no, etc.).
    // A missing key 500s the cost endpoint under APP_DEBUG and silently nulls
    // in production — both wrong. Then override the PER-SECTION fields.
    return {
      ...this.designSpecificationForm.getRawValue(),
      product_id: leaf.productId ?? g['product_id'].value,
      category_type: leaf.category ?? g['category_type'].value,
      casement_type: leaf.casementType ?? g['casement_type'].value,
      sash_id: leaf.sashId ?? g['sash_id'].value,
      palla_type: 1,
      height: leaf._hMm != null ? Math.round(leaf._hMm) : g['height'].value,
      width: leaf._wMm != null ? Math.round(leaf._wMm) : g['width'].value,
      handle_id: leaf.handleId ?? g['handle_id'].value,
      opening_direction: leaf.openingDirection ?? g['opening_direction'].value,
      hinges_type: leaf.hingesType ?? g['hinges_type'].value,
    };
  }

  /** Depth-first search for a node by id. */
  private _findPane(id: string, node: PaneNode): PaneNode | null {
    if (node.id === id) return node;
    if (!node.split) return null;
    for (const child of node.split.children) {
      const found = this._findPane(id, child);
      if (found) return found;
    }
    return null;
  }

  /** Find the parent split node of `id` (null when `id` is the root). */
  private _findParent(id: string, node: PaneNode): PaneNode | null {
    if (!node.split) return null;
    for (const child of node.split.children) {
      if (child.id === id) return node;
      const found = this._findParent(id, child);
      if (found) return found;
    }
    return null;
  }

  /**
   * The single, authoritative answer to "is a leaf section currently selected?".
   * Returns the selected node ONLY when it still exists in the current tree AND is
   * a LEAF (no `.split`); otherwise null. EVERY per-pane control handler routes its
   * leaf-vs-whole-window decision through here so the behaviour is deterministic:
   *  - non-null → a section is highlighted; the change targets THAT section only;
   *  - null     → nothing (or a stale / non-leaf id) is selected; the change
   *    applies to the WHOLE window.
   * This also makes a stale `selectedPaneId` (left over after a node-replacing
   * operation such as palla re-division or a mullion split) self-heal to the
   * whole-window path instead of silently mutating an unexpected pane — removing
   * the "sometimes one palla, sometimes the whole window" ambiguity.
   */
  private _selectedLeaf(): PaneNode | null {
    if (!this.selectedPaneId) return null;
    const node = this._findPane(this.selectedPaneId, this.rootPane);
    return node && !node.split ? node : null;
  }

  /**
   * Rebuild the top-level subdivision from the palla (division) count.
   *  - 0 → a single un-framed glazed pane (e.g. a fixed casement),
   *  - 1 → a single framed sash leaf (openable / one-palla slidding),
   *  - n → `n` equal framed sashes side by side (vertical palla split).
   * Resets selection because the previous leaf ids no longer exist.
   */
  /**
   * SUPER SYSTEM: divide ONLY the given section into `divisions` palla panes,
   * inheriting that section's own system/type/config (not the global controls),
   * so the rest of the window (other sections + manual mullions) is untouched.
   */
  private _applyPallaToLeaf(leaf: PaneNode, divisions: number) {
    const baseDir = leaf.openingDirection ?? this.df['opening_direction']?.value ?? 'Left';
    const baseHandle = leaf.handleId ?? this.df['handle_id']?.value;
    const baseHinges = leaf.hingesType ?? this.df['hinges_type']?.value;
    const baseCasement = leaf.casementType ?? this.df['casement_type']?.value;
    const baseSash = leaf.sashId ?? this.df['sash_id']?.value;
    const baseCategory = leaf.category ?? this.df['category_type']?.value;
    const baseProduct = leaf.productId ?? this.df['product_id']?.value;

    if (!divisions || divisions <= 1) {
      // Single pane: collapse any sub-split back to a plain glazed section.
      delete leaf.split;
      return;
    }
    const children: PaneNode[] = [];
    const fractions: number[] = [];
    for (let i = 0; i < divisions; i++) {
      children.push(
        this._newLeaf(
          true,
          i % 2 === 0 ? 'Left' : 'Right',
          baseHandle,
          baseHinges,
          baseCasement,
          baseSash,
          baseCategory,
          baseProduct
        )
      );
      fractions.push(1 / divisions);
    }
    leaf.split = {
      direction: 'vertical',
      kind: 'palla',
      mullionWidthMm: designConst.mullionWidthMm,
      children,
      fractions,
    };
  }

  private _applyPallaDivisions(divisions: number) {
    // Seed each new palla leaf with its own direction: a single sash inherits the
    // current global control, multiple sashes alternate Left/Right so adjacent
    // divisions read sensibly (e.g. a 2-track slider's sashes face opposite ways).
    const baseDir = this.df['opening_direction']?.value || 'Left';
    const baseHandle = this.df['handle_id']?.value;
    const baseHinges = this.df['hinges_type']?.value;
    // SUPER SYSTEM: seed each palla section with the current casement type + sash
    // id so a freshly-divided window inherits the config until the user
    // re-configures an individual section.
    const baseCasement = this.df['casement_type']?.value;
    const baseSash = this.df['sash_id']?.value;
    // SUPER SYSTEM: seed each palla section with the current SYSTEM (category) and
    // its frame product so a freshly-divided window inherits the system until the
    // user re-configures an individual section.
    const baseCategory = this.df['category_type']?.value;
    const baseProduct = this.df['product_id']?.value;
    if (!divisions || divisions < 1) {
      this.rootPane = this._newLeaf(
        false,
        baseDir,
        baseHandle,
        baseHinges,
        baseCasement,
        baseSash,
        baseCategory,
        baseProduct
      );
    } else if (divisions === 1) {
      this.rootPane = {
        id: `p${++this._paneIdSeq}`,
        framed: false,
        split: {
          direction: 'vertical',
          kind: 'palla',
          mullionWidthMm: designConst.mullionWidthMm,
          children: [
            this._newLeaf(
              true,
              baseDir,
              baseHandle,
              baseHinges,
              baseCasement,
              baseSash,
              baseCategory,
              baseProduct
            ),
          ],
          fractions: [1],
        },
      };
    } else {
      const children: PaneNode[] = [];
      const fractions: number[] = [];
      for (let i = 0; i < divisions; i++) {
        children.push(
          this._newLeaf(
            true,
            i % 2 === 0 ? 'Left' : 'Right',
            baseHandle,
            baseHinges,
            baseCasement,
            baseSash,
            baseCategory,
            baseProduct
          )
        );
        fractions.push(1 / divisions);
      }
      this.rootPane = {
        id: `p${++this._paneIdSeq}`,
        framed: false,
        split: {
          direction: 'vertical',
          kind: 'palla',
          mullionWidthMm: designConst.mullionWidthMm,
          children,
          fractions,
        },
      };
    }
    this.selectedPaneId = null;
    this.pallaSelected = false;
    this.showHeightWidthOption = false;
  }

  /**
   * THE single source of truth for what is on the canvas. Clears the layer and
   * renders the entire window from {@link rootPane}: outer frame + dimensions,
   * then the recursive pane tree (each mullion bar drawn exactly once). Also
   * rebuilds {@link mullionArray} from the tree so the save payload stays in
   * sync. Because every mutation routes through here, shapes can never
   * accumulate or orphan — the duplication bug is eliminated by construction.
   */
  private _redraw() {
    this.layer.removeChildren();
    this._rootGlassRect = null;
    this.mullionArray = [];

    const stageW = this.stage.width();
    const stageH = this.stage.height();

    // White capture background — FIRST shape every redraw so `stage.toDataURL()`
    // produces an opaque white-background PNG (never transparent) that prints
    // correctly on the quotation PDF regardless of the page background.
    this.layer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: stageW,
        height: stageH,
        fill: '#ffffff',
        listening: false,
      })
    );

    const widthMm = Number(this.f['width'].value);
    const heightMm = Number(this.f['height'].value);
    if (!this.isFrameSizeValid(widthMm, heightMm)) return;

    // Layout with explicit margins so the dimension annotations never clip in the
    // captured image. The width dim line + label sit BELOW the frame (~gap 28 +
    // text) and the height dim line + rotated label sit to the LEFT (~gap 28 +
    // label offset 20). Reserving generous left/bottom margins (and small top/
    // right) guarantees the whole composition — frame, soft shadow and all
    // annotations — stays inside the 700x800 stage. The window is centred within
    // the remaining drawable box. (Replaces FinalService.calculations' symmetric
    // padding, which left the left/bottom annotations only a hair of clearance.)
    const marginLeft = 60; // height dim line + rotated mm label
    const marginRight = 22; // frame drop-shadow breathing room
    const marginTop = 22;
    const marginBottom = 58; // width dim line + mm label
    const availW = stageW - marginLeft - marginRight;
    const availH = stageH - marginTop - marginBottom;
    const ratio = Math.min(availW / widthMm, availH / heightMm);
    this.ratio = ratio;
    const frameWpx = widthMm * ratio;
    const frameHpx = heightMm * ratio;
    const xPos = marginLeft + (availW - frameWpx) / 2;
    const yPos = marginTop + (availH - frameHpx) / 2;

    // Frame profile thickness in mm → pixels (use the real profile face width
    // when the backend provides it, else the constConfig default).
    const selectedFrameProfile = this.profileList?.find(
      (p) => String(p.id) === String(this.df['product_id']?.value)
    );
    const frameThicknessMm =
      selectedFrameProfile?.face_width_mm ?? designConst.frameThicknessMm;
    this.frameGapPx = Math.max(
      designConst.minFramePx,
      Math.round(frameThicknessMm * ratio)
    );

    const color = this.f['profile_color'].value;
    const wPx = widthMm * ratio;
    const hPx = heightMm * ratio;

    // Outer frame: background rect, overall dimension lines, mitred bands.
    this._createOuterFrame(1, xPos, yPos, ratio, widthMm, heightMm, color, true);

    // Glazed interior box (inside the outer frame) in both px and mm.
    const ix = xPos + this.frameGapPx;
    const iy = yPos + this.frameGapPx;
    const iw = wPx - 2 * this.frameGapPx;
    const ih = hPx - 2 * this.frameGapPx;
    const iwMm = widthMm - 2 * frameThicknessMm;
    const ihMm = heightMm - 2 * frameThicknessMm;

    this._drawPane(
      this.rootPane,
      ix,
      iy,
      iw,
      ih,
      iwMm,
      ihMm,
      ratio,
      frameThicknessMm,
      color
    );

    // Corner connector lines (only meaningful for a single, un-split pane).
    if (this._rootGlassRect && !this.rootPane.split) {
      const connectors = this._designService.cornerConnectors(
        this._rootGlassRect,
        xPos,
        yPos,
        widthMm,
        heightMm,
        ratio
      );
      this.layer.add(connectors);
    }

    // Frame click selects the whole window (only when it is a single pane).
    if (this.ouerRect && this._rootGlassRect && !this.rootPane.split) {
      const root = this.rootPane;
      const rootRect = this._rootGlassRect;
      const evt = isMobile ? 'tap' : 'click';
      this.ouerRect.on(evt, () => this._onPaneClick(root, rootRect));
    }

    this.layer.draw();
  }

  /**
   * Recursively render one pane region. Works in parallel px/mm space so
   * dimensions are exact at any zoom. A `framed` node draws its sash band first
   * and insets its content; a leaf draws glass (+ glazing bars / opening
   * symbol); a split lays out its children along the axis, drawing a mullion
   * bar between them for `mullion` kind and accumulating the save payload.
   */
  private _drawPane(
    node: PaneNode,
    x: number,
    y: number,
    w: number,
    h: number,
    wMm: number,
    hMm: number,
    ratio: number,
    frameThicknessMm: number,
    color: string
  ) {
    node._wMm = wMm;
    node._hMm = hMm;

    // Sash band around a framed node; content area shrinks by the frame inset.
    let cx = x;
    let cy = y;
    let cw = w;
    let ch = h;
    let cwMm = wMm;
    let chMm = hMm;
    if (node.framed) {
      if (this.usePolygonRenderer) {
        this._addPolygonFrameBands(x, y, w, h, this.frameGapPx, color);
      }
      cx = x + this.frameGapPx;
      cy = y + this.frameGapPx;
      cw = w - 2 * this.frameGapPx;
      ch = h - 2 * this.frameGapPx;
      cwMm = wMm - 2 * frameThicknessMm;
      chMm = hMm - 2 * frameThicknessMm;
    }

    if (!node.split) {
      this._drawLeafGlass(node, cx, cy, cw, ch, cwMm, chMm);
      return;
    }

    const split = node.split;
    const n = split.children.length;
    const isVertical = split.direction === 'vertical';
    const dividerPx =
      split.kind === 'mullion'
        ? Math.max(
            designConst.minFramePx,
            Math.round(split.mullionWidthMm * ratio)
          )
        : 0;
    const dividerMm = split.kind === 'mullion' ? split.mullionWidthMm : 0;

    if (isVertical) {
      // Available span = content width minus the (n-1) divider faces; each child
      // gets fraction × avail. This is why a 1500 frame's two halves read ~660
      // each, NOT 750: the outer frame (2 × frameFace) and the mullion face are
      // deducted first, so 2×pane + mullionFace + 2×frameFace ≈ 1500 (intentional).
      const availPx = cw - (n - 1) * dividerPx;
      const availMm = cwMm - (n - 1) * dividerMm;
      split._availMm = availMm;
      let px = cx;
      for (let i = 0; i < n; i++) {
        const childW = split.fractions[i] * availPx;
        const childWMm = split.fractions[i] * availMm;
        this._drawPane(
          split.children[i],
          px,
          cy,
          childW,
          ch,
          childWMm,
          chMm,
          ratio,
          frameThicknessMm,
          color
        );
        if (i < n - 1) {
          const barX = px + childW;
          if (split.kind === 'mullion') {
            this._drawMullionBar(barX, cy, dividerPx, ch, true, color);
            // Save payload: a vertical mullion's length spans the pane height.
            this.mullionArray.push({
              direction: 'vertical',
              length: Math.round(chMm),
              product_id: split.profileId,
            });
          }
        }
        px += childW + dividerPx;
      }
    } else {
      const availPx = ch - (n - 1) * dividerPx;
      const availMm = chMm - (n - 1) * dividerMm;
      split._availMm = availMm;
      let py = cy;
      for (let i = 0; i < n; i++) {
        const childH = split.fractions[i] * availPx;
        const childHMm = split.fractions[i] * availMm;
        this._drawPane(
          split.children[i],
          cx,
          py,
          cw,
          childH,
          cwMm,
          childHMm,
          ratio,
          frameThicknessMm,
          color
        );
        if (i < n - 1) {
          const barY = py + childH;
          if (split.kind === 'mullion') {
            this._drawMullionBar(cx, barY, cw, dividerPx, false, color);
            // Save payload: a horizontal mullion's length spans the pane width.
            this.mullionArray.push({
              direction: 'horizontal',
              length: Math.round(cwMm),
              product_id: split.profileId,
            });
          }
        }
        py += childH + dividerPx;
      }
    }
  }

  /** Draw a leaf's glass, glazing bars and (if openable) the opening symbol. */
  private _drawLeafGlass(
    node: PaneNode,
    x: number,
    y: number,
    w: number,
    h: number,
    wMm: number,
    hMm: number
  ) {
    const noGlass = this.df['glazz_id'].value == 20;
    const selected = this.selectedPaneId === node.id;
    const fill = selected
      ? designConst.selectedRectColor
      : noGlass
      ? designConst.noGlassRectColor
      : designConst.defaultRectColor;

    // Store mm region size on the rect data (width/height) for compatibility.
    const glass = this._createRect(
      x,
      y,
      w,
      h,
      fill,
      designConst.strokeDefaultColor,
      hMm,
      wMm
    );
    glass.setAttr('paneId', node.id);
    const evt = isMobile ? 'tap' : 'click';
    glass.on(evt, () => this._onPaneClick(node, glass));

    // Normal glazing reads as real glass: a soft top→bottom blue gradient on the
    // (clickable) glass rect plus a faint diagonal reflection streak overlaid on
    // top. The selected-highlight and "no glass" states keep their flat fill so
    // they stay unmistakable. The glass rect itself remains the click target.
    if (!selected && !noGlass) {
      glass.fillPriority('linear-gradient');
      glass.fillLinearGradientStartPoint({ x: 0, y: 0 });
      glass.fillLinearGradientEndPoint({ x: 0, y: h });
      glass.fillLinearGradientColorStops([0, '#e9f4fb', 1, '#c4e4f1']);
    }
    this.layer.add(glass);
    if (!selected && !noGlass) {
      this._drawGlassReflection(x, y, w, h);
    }
    if (node === this.rootPane) this._rootGlassRect = glass;

    // Glazing / Georgian bars across the glazed area.
    this._drawGlazingBars(
      x,
      y,
      w,
      h,
      Number(this.df['glazing_bars_vertical']?.value || 0),
      Number(this.df['glazing_bars_horizontal']?.value || 0),
      this.f['profile_color'].value
    );

    // Opening / slide symbology — per leaf. Each leaf draws using ITS OWN
    // direction, falling back to the global control when it has none yet.
    // SUPER SYSTEM: casement type is also per-leaf, so within one Casement
    // window an Openable section renders a sash + egress + handle + hinges while
    // a Fixed section beside it renders plain glass — driven entirely by the
    // leaf's own `casementType` (falling back to the global control as legacy).
    // SUPER SYSTEM: each section decides its symbology from its OWN system. So a
    // mullion-split window with the UPPER section Slidding and the LOWER section
    // Casement-Openable renders the slide arrow above and the sash + egress +
    // handle + hinges below — only the leaf's own `category` drives this.
    const category = node.category ?? this.df['category_type'].value;
    const casementType = node.casementType ?? this.df['casement_type'].value;
    const direction =
      node.openingDirection ?? this.df['opening_direction']?.value ?? 'Left';

    // Resolve THIS leaf's handle name (its own handleId, else the form's) so the
    // glyph family is per-pane. Empty when no handle is selected.
    const handleName = this._handleNameForLeaf(node);

    if (category === 'Casement' && casementType === 'Openable') {
      // Casement openable sash: inset sash band + diagonal egress chevron + handle.
      const sashInset = Math.max(3, Math.round(this.frameGapPx * 0.55));
      this.layer.add(
        new Konva.Rect({
          x: x + sashInset,
          y: y + sashInset,
          width: w - 2 * sashInset,
          height: h - 2 * sashInset,
          stroke: '#555555',
          strokeWidth: 3,
          listening: false,
        })
      );
      this._drawOpeningSymbol(x, y, w, h, direction, handleName);
      // Hinge ticks on the hinge stile (the egress apex side). Count: 3 for 3D
      // hinges, 2 otherwise — per leaf, falling back to the form control.
      const hingeSide = this._hingeSideFor(direction);
      const hinges = node.hingesType ?? this.df['hinges_type']?.value;
      const tickCount = hinges === '3D Hinges' ? 3 : 2;
      this._drawHingeMarks(x, y, w, h, hingeSide, tickCount);
    } else if (category === 'Slidding') {
      // Sliding sash: conventional horizontal slide arrow (distinct from the
      // casement egress chevron), per movable sliding leaf.
      this._drawSlidingSymbol(x, y, w, h, direction, handleName);
    }

    // Per-leaf structural size label. Only drawn when this leaf is part of a
    // split (not the whole-window root) so the per-pane mm clearly add up across
    // a division — see the note in `_drawPane` on why each pane is NOT a naive
    // half (frame + mullion face widths are deducted).
    if (node !== this.rootPane) {
      this._drawPaneSizeLabel(x, y, w, node._wMm, node._hMm);
    }
  }

  /**
   * Conventional sliding-window symbol: a single horizontal arrow centred on the
   * sash pointing in the slide direction (Left | Right). Visually distinct from
   * the casement egress chevron so a slider is never confused with a casement.
   */
  private _drawSlidingSymbol(
    x: number,
    y: number,
    w: number,
    h: number,
    direction: string,
    handleName?: string
  ) {
    const slidesRight = (direction || 'Left').toLowerCase().includes('right');
    const stroke = '#1f6feb';
    // Inset sash band so the movable sash reads clearly inside the frame.
    const sashInset = Math.max(3, Math.round(this.frameGapPx * 0.55));
    this.layer.add(
      new Konva.Rect({
        x: x + sashInset,
        y: y + sashInset,
        width: w - 2 * sashInset,
        height: h - 2 * sashInset,
        stroke: '#555555',
        strokeWidth: 3,
        listening: false,
      })
    );
    const cy = y + h / 2;
    const margin = Math.max(10, w * 0.22);
    const xL = x + margin;
    const xR = x + w - margin;
    this.layer.add(
      new Konva.Arrow({
        points: slidesRight ? [xL, cy, xR, cy] : [xR, cy, xL, cy],
        stroke,
        fill: stroke,
        strokeWidth: 2,
        pointerLength: 10,
        pointerWidth: 10,
        pointerAtBeginning: false,
        pointerAtEnding: true,
        listening: false,
      })
    );
    // Handle glyph on the leading (slide-direction) edge — drawn only when a
    // (sliding) handle is actually selected for this leaf.
    if (handleName) {
      this._handleGlyph(x, y, w, h, slidesRight ? 'right' : 'left', handleName);
    }
  }

  /**
   * Draw a small centred mm size label for a sub-divided leaf. The width shown is
   * the leaf's TRUE structural region size (`node._wMm`), i.e. (interior −
   * dividers) / count — intentionally less than a naive equal split because the
   * frame and mullion face widths are deducted (e.g. 1500 → 660 + 660 across a
   * mullion split, not 750 + 750).
   */
  private _drawPaneSizeLabel(
    x: number,
    y: number,
    w: number,
    wMm?: number,
    hMm?: number
  ) {
    if (!wMm || !hMm) return;
    this.layer.add(
      new Konva.Text({
        x,
        y: y + 4,
        width: w,
        align: 'center',
        text: `${Math.round(wMm)} × ${Math.round(hMm)} mm`,
        fontSize: 11,
        fill: '#333333',
        listening: false,
      })
    );
  }

  /** Draw a single mullion bar as a mitred polygon band (visual only). */
  private _drawMullionBar(
    x: number,
    y: number,
    w: number,
    h: number,
    isVertical: boolean,
    color: string
  ) {
    if (this.usePolygonRenderer) {
      const pts = [x, y, x + w, y, x + w, y + h, x, y + h];
      const bar = createMullionShape(pts, color);
      bar.listening(false); // visual only; clicks fall through to panes
      this.layer.add(bar);
    } else {
      this.layer.add(
        new Konva.Rect({
          x,
          y,
          width: w,
          height: h,
          fill: color && color !== '#ffffff' ? color : '#888888',
          stroke: designConst.strokeDefaultColor,
          strokeWidth: 2,
          listening: false,
        })
      );
    }
  }

  /**
   * Unified leaf-pane click handler. Selection is by node id (survives redraw).
   *  - root leaf  → opens the Design Specification form (rectSelected) and
   *    enables Add Mullion, matching the legacy "main pane" behaviour;
   *  - mullion-split child → enables Add Mullion + the portion resize form;
   *  - palla-division child → enables Add Mullion only.
   * Clicking the already-selected pane deselects it.
   */
  private _onPaneClick(node: PaneNode, _rect: Konva.Rect) {
    if (this.selectedPaneId === node.id) {
      this._deselectPane();
      return;
    }
    const parent = this._findParent(node.id, this.rootPane);
    const isRoot = !parent;

    if (isRoot) {
      if (this.rectSelected && this.designSpecificationForm.invalid) {
        this._toastService.showError(
          'Please fill all the required fields first'
        );
        return;
      }
      this.selectedPaneId = node.id;
      this.selectedRect = _rect;
      this.designSpecArray[0] = this.designSpecificationForm.getRawValue();
      this.rectSelected = true;
      this.isAddMullion = true;
      this.pallaSelected = false;
      this.showHeightWidthOption = false;
    } else {
      // Selecting a child pane (a palla division or a mullion portion). Keep
      // the spec form open (rectSelected) so the per-pane "Opening Direction"
      // control stays visible and now targets THIS pane. A mullion portion
      // additionally gets the width/height resize form.
      this.selectedPaneId = node.id;
      this.selectedRect = _rect;
      this.isAddMullion = true;
      this.rectSelected = true;
      if (parent!.split!.kind === 'mullion') {
        this.pallaSelected = true;
        this.showHeightWidthOption = true;
        this.pallaForm.patchValue({
          width: Math.round(node._wMm ?? 0),
          height: Math.round(node._hMm ?? 0),
        });
      } else {
        this.pallaSelected = false;
        this.showHeightWidthOption = false;
      }
    }
    // Mirror the selected leaf's own direction into the shared control so the
    // dropdown reflects this pane. emitEvent:false prevents the control's
    // valueChanges from firing a redundant (whole-window) re-apply.
    if (!node.split) {
      this.designSpecificationForm
        .get('opening_direction')
        ?.setValue(
          node.openingDirection ?? this.df['opening_direction']?.value ?? 'Left',
          { emitEvent: false }
        );
      // Mirror the leaf's own handle + hinge type into the shared controls so the
      // dropdowns reflect THIS pane. emitEvent:false keeps their valueChanges from
      // firing a redundant whole-window re-apply.
      if (node.handleId != null) {
        this.designSpecificationForm
          .get('handle_id')
          ?.setValue(node.handleId, { emitEvent: false });
      }
      if (node.hingesType != null) {
        this.designSpecificationForm
          .get('hinges_type')
          ?.setValue(node.hingesType, { emitEvent: false });
      }
      // SUPER SYSTEM: mirror this section's own SYSTEM (category) into the shared
      // control so the Design Spec form reflects (and now targets) THIS section.
      // emitEvent:false keeps its valueChanges from firing a redundant whole-window
      // re-apply / tree rebuild.
      if (node.category != null) {
        this.designSpecificationForm
          .get('category_type')
          ?.setValue(node.category, { emitEvent: false });
      }
      // SUPER SYSTEM: mirror this section's own casement type + sash id into the
      // shared controls so the Design Spec form reflects (and now targets) THIS
      // section. emitEvent:false keeps their valueChanges from firing a redundant
      // whole-window re-apply.
      if (node.casementType != null) {
        this.designSpecificationForm
          .get('casement_type')
          ?.setValue(node.casementType, { emitEvent: false });
      }
      if (node.sashId != null && node.sashId !== '') {
        this.designSpecificationForm
          .get('sash_id')
          ?.setValue(node.sashId, { emitEvent: false });
      }
    }
    this._redraw();
  }

  /** Clear pane selection and the dependent UI flags, then redraw. */
  private _deselectPane() {
    this.selectedPaneId = null;
    this.rectSelected = false;
    this.isAddMullion = false;
    this.pallaSelected = false;
    this.showHeightWidthOption = false;
    this._redraw();
  }

  private isFrameSizeValid(width: number, height: number): boolean {
    // return width >= 300 && width <= 5800 && height >= 300 && height <= 5800;
    return true;
  }

  private _createOuterFrame(
    i: number,
    xPos: number,
    yPos: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number,
    profile_color: string,
    is_direction: boolean
  ) {
    this.ouerRect = this._createRect(
      xPos,
      yPos,
      frameWidth * ratio,
      frameHeight * ratio,
      profile_color,
      designConst.strokeDefaultColor,
      frameWidth,
      frameHeight,
      'type'
    );
    // Subtle soft drop shadow on the outer frame so the window lifts off the
    // white background. Kept low-blur / low-opacity so it stays clean and prints
    // well even in greyscale. (The white capture rect sits behind it.)
    this.ouerRect.shadowColor('#000000');
    this.ouerRect.shadowBlur(10);
    this.ouerRect.shadowOffset({ x: 2, y: 4 });
    this.ouerRect.shadowOpacity(0.22);
    // WindowMaker-style dimension lines: extension lines + double-headed
    // arrows + mm labels for overall width (below) and height (left).
    this._drawDimensions(
      xPos,
      yPos,
      frameWidth * ratio,
      frameHeight * ratio,
      frameWidth,
      frameHeight
    );
    this.layer.add(this.ouerRect);
    // Phase 3: overlay mitred polygon bands for the four frame sides.
    // ouerRect remains the background fill and click target; bands add profile fidelity.
    if (this.usePolygonRenderer) {
      this._addPolygonFrameBands(
        xPos,
        yPos,
        frameWidth * ratio,
        frameHeight * ratio,
        this.frameGapPx,
        profile_color
      );
    }
  }

  private _createInnerFrame(
    xPos: number,
    yPos: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number
  ) {}

  private _createRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
    frameWidth: number,
    frameHeight: number,
    type?: string
  ): Konva.Rect {
    const rect = this._konvaDesignService.createRect(
      x,
      y,
      width,
      height,
      fill,
      stroke,
      frameWidth,
      frameHeight,
      type
    );
    return rect;
  }

  /** Phase 3 helper: shift every coordinate pair in a flat points array by (dx, dy). */
  private _offsetPoints(points: number[], dx: number, dy: number): number[] {
    return points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
  }

  /** Phase 3: draw four mitred polygon bands for the frame/sash border.
   *  All four bands are non-listening (visual only) — click events fall through
   *  to the Konva.Rect elements added to the layer before them.
   *
   *  @param xPos     canvas x origin of the frame bounding box
   *  @param yPos     canvas y origin of the frame bounding box
   *  @param widthPx  total pixel width of the frame bounding box
   *  @param heightPx total pixel height of the frame bounding box
   *  @param marginPx frame profile thickness in pixels (= face_width_mm * ratio)
   *  @param color    profile fill colour (hex string from profile_color control)
   */
  private _addPolygonFrameBands(
    xPos: number,
    yPos: number,
    widthPx: number,
    heightPx: number,
    marginPx: number,
    color: string
  ): void {
    // Two-tone bevel: light source from the top-left, so the top (3) and left (2)
    // profile faces read a touch lighter and the right (1) and bottom (4) faces a
    // touch darker. This gives each mitred band a sense of depth (a real chamfered
    // UPVC profile) while the crisp black mitre outline from createFrameLine keeps
    // corners clean. Works for white/grey defaults and any selected profile colour.
    for (let dir = 1; dir <= 4; dir++) {
      const pts = getFramePoints(dir, widthPx, heightPx, marginPx);
      const lit = dir === 2 || dir === 3;
      const faceColor = this._shadeColor(color, lit ? 0.16 : -0.13);
      const line = createFrameLine(this._offsetPoints(pts, xPos, yPos), faceColor);
      line.listening(false);  // visual only; clicks pass through to rects beneath
      this.layer.add(line);
    }
    // Thin inner reveal line around the glazed opening — a slightly darker hairline
    // that reads as the inner profile shadow/rebate, sharpening the frame edge.
    const inX = xPos + marginPx;
    const inY = yPos + marginPx;
    const inW = widthPx - 2 * marginPx;
    const inH = heightPx - 2 * marginPx;
    if (inW > 0 && inH > 0) {
      this.layer.add(
        new Konva.Rect({
          x: inX,
          y: inY,
          width: inW,
          height: inH,
          stroke: this._shadeColor(color, -0.28),
          strokeWidth: 1,
          listening: false,
        })
      );
    }
  }

  /**
   * Lighten (percent > 0, toward white) or darken (percent < 0, toward black) a
   * hex colour by the given fraction. Used to derive the two-tone profile bevel
   * faces and the inner reveal line from the single profile colour. Non-hex or
   * empty input falls back to white so the renderer never throws.
   */
  private _shadeColor(hex: string, percent: number): string {
    let h = (hex || '#ffffff').trim();
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) h = 'ffffff';
    const num = parseInt(h, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    const target = percent < 0 ? 0 : 255;
    const p = Math.min(1, Math.abs(percent));
    r = Math.round((target - r) * p) + r;
    g = Math.round((target - g) * p) + g;
    b = Math.round((target - b) * p) + b;
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /**
   * Draw the WindowMaker-style opening symbology on a sash: the diagonal
   * "egress" lines (apex at the hinge side) plus a handle glyph on the
   * opposite edge. `direction` is the hinge side: Left | Right | Top | Bottom.
   */
  private _drawOpeningSymbol(
    x: number,
    y: number,
    w: number,
    h: number,
    direction: string,
    handleName?: string
  ) {
    const dir = (direction || 'Left').toLowerCase();
    const tiltTurn = dir.startsWith('tilt');
    // For tilt & turn, the turn (side-hung) side is encoded in the label.
    const turnSide: 'left' | 'right' = dir.includes('right') ? 'right' : 'left';

    if (tiltTurn) {
      // Turn = solid side-hung egress; Tilt = dashed top-hung egress.
      this._egressLines(x, y, w, h, turnSide, false);
      this._egressLines(x, y, w, h, 'top', true);
      // handle sits on the edge opposite the hinge (turn) side.
      this._handleGlyph(
        x,
        y,
        w,
        h,
        turnSide === 'left' ? 'right' : 'left',
        handleName
      );
      return;
    }

    const side =
      dir === 'right' ? 'right' : dir === 'top' ? 'top' : dir === 'bottom' ? 'bottom' : 'left';
    this._egressLines(x, y, w, h, side as any, false);
    const opposite: any =
      side === 'left' ? 'right' : side === 'right' ? 'left' : side === 'top' ? 'bottom' : 'top';
    this._handleGlyph(x, y, w, h, opposite, handleName);
  }

  /**
   * WindowMaker-style overall dimension lines: witness/extension lines from the
   * frame corners, a double-headed dimension arrow, and a centred mm label.
   * Width is placed below the window, height to the left.
   */
  private _drawDimensions(
    x: number,
    y: number,
    wPx: number,
    hPx: number,
    wMm: number,
    hMm: number
  ) {
    const col = '#444444';
    const extOver = 6; // how far witness lines overshoot the dim line
    const gap = 28; // distance from frame to dim line

    // ---- WIDTH (below) ----
    const wy = y + hPx + gap;
    this.layer.add(
      new Konva.Line({ points: [x, y + hPx, x, wy + extOver], stroke: col, strokeWidth: 0.75, listening: false })
    );
    this.layer.add(
      new Konva.Line({ points: [x + wPx, y + hPx, x + wPx, wy + extOver], stroke: col, strokeWidth: 0.75, listening: false })
    );
    this.layer.add(
      new Konva.Arrow({
        points: [x, wy, x + wPx, wy],
        stroke: col, fill: col, strokeWidth: 1,
        pointerLength: 6, pointerWidth: 6,
        pointerAtBeginning: true, pointerAtEnding: true, listening: false,
      })
    );
    this.layer.add(
      new Konva.Text({ x, y: wy + 5, width: wPx, align: 'center', text: `${wMm} mm`, fontSize: 12, fill: col, listening: false })
    );

    // ---- HEIGHT (left) ----
    const hxLine = x - gap;
    this.layer.add(
      new Konva.Line({ points: [x, y, hxLine - extOver, y], stroke: col, strokeWidth: 0.75, listening: false })
    );
    this.layer.add(
      new Konva.Line({ points: [x, y + hPx, hxLine - extOver, y + hPx], stroke: col, strokeWidth: 0.75, listening: false })
    );
    this.layer.add(
      new Konva.Arrow({
        points: [hxLine, y, hxLine, y + hPx],
        stroke: col, fill: col, strokeWidth: 1,
        pointerLength: 6, pointerWidth: 6,
        pointerAtBeginning: true, pointerAtEnding: true, listening: false,
      })
    );
    // Rotated, centred height label sitting clear to the LEFT of the dim line.
    // With rotation -90 the font-height extends toward +x, so offset by the
    // font height (~14px) plus a gap to keep the text off the arrow line.
    this.layer.add(
      new Konva.Text({
        x: hxLine - 20, y: y + hPx, width: hPx, align: 'center',
        text: `${hMm} mm`, fontSize: 12, fill: col, rotation: -90, listening: false,
      })
    );
  }

  /** Draw evenly-spaced glazing/Georgian bars within a glazed area. */
  private _drawGlazingBars(
    x: number,
    y: number,
    w: number,
    h: number,
    vBars: number,
    hBars: number,
    color: string
  ) {
    const barPx = 3;
    const fill = color && color !== '#ffffff' ? color : '#bfbfbf';
    for (let i = 1; i <= vBars; i++) {
      const bx = x + (w / (vBars + 1)) * i;
      this.layer.add(
        new Konva.Rect({
          x: bx - barPx / 2,
          y,
          width: barPx,
          height: h,
          fill,
          stroke: '#777777',
          strokeWidth: 0.5,
          listening: false,
        })
      );
    }
    for (let j = 1; j <= hBars; j++) {
      const by = y + (h / (hBars + 1)) * j;
      this.layer.add(
        new Konva.Rect({
          x,
          y: by - barPx / 2,
          width: w,
          height: barPx,
          fill,
          stroke: '#777777',
          strokeWidth: 0.5,
          listening: false,
        })
      );
    }
  }

  /**
   * Faint diagonal reflection streak across a glazed pane — a low-opacity white
   * parallelogram (the main glint) plus a thin brighter highlight line. Purely
   * decorative: non-listening overlay sitting above the glass gradient, kept well
   * inside the pane bounds so it never spills over a mullion or sash. Subtle
   * enough to print cleanly in greyscale.
   */
  private _drawGlassReflection(x: number, y: number, w: number, h: number) {
    // Slanted band running from the upper area down to the lower-left, like light
    // catching the glass. Coordinates stay within 0.12w..0.72w of the pane width.
    const band = [
      x + w * 0.52, y,
      x + w * 0.72, y,
      x + w * 0.32, y + h,
      x + w * 0.12, y + h,
    ];
    this.layer.add(
      new Konva.Line({
        points: band,
        closed: true,
        fill: '#ffffff',
        opacity: 0.12,
        listening: false,
      })
    );
    // Thin crisp highlight along the leading edge of the streak.
    this.layer.add(
      new Konva.Line({
        points: [x + w * 0.66, y, x + w * 0.26, y + h],
        stroke: '#ffffff',
        strokeWidth: 1.5,
        opacity: 0.22,
        listening: false,
      })
    );
  }

  /** Draw the two diagonal egress lines whose apex sits on `side` (the hinge). */
  private _egressLines(
    x: number,
    y: number,
    w: number,
    h: number,
    side: 'left' | 'right' | 'top' | 'bottom',
    dashed: boolean
  ) {
    const stroke = '#1f6feb';
    const cx = x + w / 2;
    const cy = y + h / 2;
    const dash = dashed ? [6, 4] : [];
    let sets: number[][];
    switch (side) {
      case 'right':
        sets = [[x, y, x + w, cy], [x, y + h, x + w, cy]];
        break;
      case 'top':
        sets = [[x, y + h, cx, y], [x + w, y + h, cx, y]];
        break;
      case 'bottom':
        sets = [[x, y, cx, y + h], [x + w, y, cx, y + h]];
        break;
      case 'left':
      default:
        sets = [[x + w, y, x, cy], [x + w, y + h, x, cy]];
        break;
    }
    sets.forEach((points) =>
      this.layer.add(
        new Konva.Line({ points, stroke, strokeWidth: 1.5, dash, listening: false })
      )
    );
  }

  /**
   * Draw a small dark handle glyph centred on `edge`. The glyph FAMILY is derived
   * from the handle's NAME (via {@link _handleGlyphFamily}) so different handle
   * types read distinctly on the canvas:
   *   - lever    (Casement / Sliding Handle, Bathroom lock, unknown) → the bar
   *   - t        (T Handle)            → a T shape
   *   - c        (C Handle)            → a C / "[" bracket
   *   - cockspur (Cockspur Handle)     → a short angled lever
   *   - knob     (Popup / Touch Lock)  → a small round knob
   *   - keep     (Espage Keep)         → a thin keep plate flush on the edge
   * Falls back to the lever bar for an unknown / empty name. Every glyph is built
   * from Konva primitives into a single non-listening group (clicks fall through
   * to the pane rect beneath) and uses a small brushed-metal palette so the
   * hardware reads crisply on the white canvas.
   */
  private _handleGlyph(
    x: number,
    y: number,
    w: number,
    h: number,
    edge: 'left' | 'right' | 'top' | 'bottom',
    handleName?: string
  ) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    // Anchor flush on the chosen edge plus the inward (toward glass centre) and
    // along-edge unit vectors used to orient every glyph for left/right/top/bottom.
    const inset = 2;
    let ax: number, ay: number; // anchor
    let ix: number, iy: number; // inward unit vector
    let lx: number, ly: number; // along-edge unit vector
    switch (edge) {
      case 'left':
        ax = x + inset; ay = cy; ix = 1; iy = 0; lx = 0; ly = 1; break;
      case 'top':
        ax = cx; ay = y + inset; ix = 0; iy = 1; lx = 1; ly = 0; break;
      case 'bottom':
        ax = cx; ay = y + h - inset; ix = 0; iy = -1; lx = 1; ly = 0; break;
      case 'right':
      default:
        ax = x + w - inset; ay = cy; ix = -1; iy = 0; lx = 0; ly = 1; break;
    }

    const family = this._handleGlyphFamily(handleName);

    // Brushed-metal hardware palette — dark enough to read on the white canvas.
    const metalBase = '#7d828c'; // shaded body
    const metalLight = '#9aa0aa'; // lit faces (levers, knobs)
    const metalHi = '#c2c7cd'; // thin specular highlight
    const outline = '#3a3d42'; // crisp dark edge

    // Sizing: the working length scales with the sash yet is clamped to a px
    // range so the hardware stays legible on both tiny and large panes.
    const minDim = Math.min(w, h);
    const leverLen = Math.max(14, Math.min(34, minDim * 0.18));
    const plateAcross = Math.max(5, Math.min(7, minDim * 0.07)); // edge -> inward
    const plateAlong = Math.max(12, Math.min(20, leverLen * 0.75)); // along edge
    const alongIsX = lx !== 0; // hinge/handle edge runs horizontally (top/bottom)
    const inwardIsX = ix !== 0; // inward axis is x (left / right edges)

    const group = new Konva.Group({ listening: false });

    // Axis-aligned rounded rect sized by its along-edge and across-edge extents
    // and centred on (cxp,cyp). Because every edge is axis-aligned, "along" maps
    // to a pure x- or y-extent — this keeps each glyph oriented to its edge.
    const slab = (
      cxp: number,
      cyp: number,
      alongLen: number,
      acrossLen: number,
      fill: string,
      radius: number,
      stroke: string = outline,
      strokeWidth = 1
    ) => {
      const wd = alongIsX ? alongLen : acrossLen;
      const ht = alongIsX ? acrossLen : alongLen;
      return new Konva.Rect({
        x: cxp - wd / 2,
        y: cyp - ht / 2,
        width: wd,
        height: ht,
        fill,
        stroke,
        strokeWidth,
        cornerRadius: radius,
        listening: false,
      });
    };

    // Escutcheon backplate, flush on the sash edge (centre of plate pushed inward
    // by half its thickness). Shared by every handle family except the keep.
    const plateCx = ax + ix * (plateAcross / 2);
    const plateCy = ay + iy * (plateAcross / 2);
    // Inner face of the plate — the base point every protruding part grows from.
    const baseX = ax + ix * plateAcross;
    const baseY = ay + iy * plateAcross;

    if (family === 'lever') {
      // Casement / sliding lever: backplate + a tapered bar reaching inward with
      // a rounded tip — the classic window lever.
      group.add(slab(plateCx, plateCy, plateAlong, plateAcross, metalBase, 2.5));
      const leverThick = Math.max(3, plateAcross * 0.85);
      const tipX = baseX + ix * leverLen;
      const tipY = baseY + iy * leverLen;
      const barCx = (baseX + tipX) / 2;
      const barCy = (baseY + tipY) / 2;
      const barW = inwardIsX ? leverLen : leverThick;
      const barH = inwardIsX ? leverThick : leverLen;
      group.add(
        new Konva.Rect({
          x: barCx - barW / 2,
          y: barCy - barH / 2,
          width: barW,
          height: barH,
          fill: metalLight,
          stroke: outline,
          strokeWidth: 1,
          cornerRadius: leverThick / 2,
          listening: false,
        })
      );
      group.add(
        new Konva.Circle({
          x: tipX,
          y: tipY,
          radius: leverThick / 2,
          fill: metalLight,
          stroke: outline,
          strokeWidth: 1,
          listening: false,
        })
      );
      // Specular line down the length of the lever.
      group.add(
        new Konva.Line({
          points: [baseX, baseY, tipX, tipY],
          stroke: metalHi,
          strokeWidth: 1,
          lineCap: 'round',
          listening: false,
        })
      );
      this.layer.add(group);
      return;
    }

    if (family === 't') {
      // T handle: backplate + an inward stem capped by an along-edge crossbar.
      group.add(slab(plateCx, plateCy, plateAlong, plateAcross, metalBase, 2.5));
      const stemThick = Math.max(3, plateAcross * 0.7);
      const stemLen = leverLen * 0.85;
      const tipX = baseX + ix * stemLen;
      const tipY = baseY + iy * stemLen;
      const stemCx = (baseX + tipX) / 2;
      const stemCy = (baseY + tipY) / 2;
      const stemW = inwardIsX ? stemLen : stemThick;
      const stemH = inwardIsX ? stemThick : stemLen;
      group.add(
        new Konva.Rect({
          x: stemCx - stemW / 2,
          y: stemCy - stemH / 2,
          width: stemW,
          height: stemH,
          fill: metalLight,
          stroke: outline,
          strokeWidth: 1,
          cornerRadius: stemThick / 2,
          listening: false,
        })
      );
      const crossLen = leverLen * 0.8;
      const crossW = alongIsX ? crossLen : stemThick;
      const crossH = alongIsX ? stemThick : crossLen;
      group.add(
        new Konva.Rect({
          x: tipX - crossW / 2,
          y: tipY - crossH / 2,
          width: crossW,
          height: crossH,
          fill: metalLight,
          stroke: outline,
          strokeWidth: 1,
          cornerRadius: stemThick / 2,
          listening: false,
        })
      );
      this.layer.add(group);
      return;
    }

    if (family === 'c') {
      // C / D pull: backplate + a half-loop grip standing off the plate. Drawn as
      // a dark stroke under a lighter stroke to fake an outlined metal bar.
      group.add(slab(plateCx, plateCy, plateAlong, plateAcross, metalBase, 2.5));
      const gripThick = Math.max(3, plateAcross * 0.75);
      const depth = leverLen * 0.7; // stand-off from the plate
      const half = (leverLen * 0.7) / 2; // half the grip length along the edge
      const pts = [
        baseX - lx * half, baseY - ly * half,
        baseX - lx * half + ix * depth, baseY - ly * half + iy * depth,
        baseX + lx * half + ix * depth, baseY + ly * half + iy * depth,
        baseX + lx * half, baseY + ly * half,
      ];
      group.add(
        new Konva.Line({
          points: pts,
          stroke: outline,
          strokeWidth: gripThick + 1.5,
          lineJoin: 'round',
          lineCap: 'round',
          listening: false,
        })
      );
      group.add(
        new Konva.Line({
          points: pts,
          stroke: metalLight,
          strokeWidth: gripThick - 0.5,
          lineJoin: 'round',
          lineCap: 'round',
          listening: false,
        })
      );
      this.layer.add(group);
      return;
    }

    if (family === 'knob') {
      // Popup / touch lock: a round rose plate + a domed knob with a glint.
      const roseR = Math.max(4, plateAcross * 0.95);
      const roseCx = ax + ix * roseR;
      const roseCy = ay + iy * roseR;
      group.add(
        new Konva.Circle({
          x: roseCx,
          y: roseCy,
          radius: roseR,
          fill: metalBase,
          stroke: outline,
          strokeWidth: 1,
          listening: false,
        })
      );
      const knobR = Math.max(4, Math.min(11, leverLen * 0.32));
      const knobCx = ax + ix * (roseR + knobR * 0.25);
      const knobCy = ay + iy * (roseR + knobR * 0.25);
      group.add(
        new Konva.Circle({
          x: knobCx,
          y: knobCy,
          radius: knobR,
          fill: metalLight,
          stroke: outline,
          strokeWidth: 1,
          listening: false,
        })
      );
      group.add(
        new Konva.Circle({
          x: knobCx,
          y: knobCy,
          radius: knobR * 0.6,
          stroke: metalHi,
          strokeWidth: 1,
          listening: false,
        })
      );
      group.add(
        new Konva.Circle({
          x: knobCx - knobR * 0.3,
          y: knobCy - knobR * 0.3,
          radius: Math.max(1, knobR * 0.18),
          fill: '#eef0f2',
          listening: false,
        })
      );
      this.layer.add(group);
      return;
    }

    if (family === 'cockspur') {
      // Cockspur handle: backplate + a short angled lever that hooks back toward
      // the frame (the spur). Dark stroke under a lighter one for an outlined bar.
      group.add(slab(plateCx, plateCy, plateAlong, plateAcross, metalBase, 2.5));
      const armThick = Math.max(3, plateAcross * 0.85);
      const elbowX = baseX + ix * leverLen * 0.75 + lx * leverLen * 0.25;
      const elbowY = baseY + iy * leverLen * 0.75 + ly * leverLen * 0.25;
      const spurX = elbowX + lx * leverLen * 0.45 - ix * leverLen * 0.18;
      const spurY = elbowY + ly * leverLen * 0.45 - iy * leverLen * 0.18;
      const arm = [baseX, baseY, elbowX, elbowY, spurX, spurY];
      group.add(
        new Konva.Line({
          points: arm,
          stroke: outline,
          strokeWidth: armThick + 1.5,
          lineJoin: 'round',
          lineCap: 'round',
          listening: false,
        })
      );
      group.add(
        new Konva.Line({
          points: arm,
          stroke: metalLight,
          strokeWidth: armThick - 0.5,
          lineJoin: 'round',
          lineCap: 'round',
          listening: false,
        })
      );
      this.layer.add(group);
      return;
    }

    // keep: a slim recessed striker plate flush on the edge — no protruding lever
    // (an espage keep has no handle), with a thin central slot.
    const keepAlong = plateAlong * 1.3;
    const keepAcross = Math.max(4, plateAcross * 0.7);
    const keepCx = ax + ix * (keepAcross / 2);
    const keepCy = ay + iy * (keepAcross / 2);
    group.add(slab(keepCx, keepCy, keepAlong, keepAcross, metalBase, 2));
    group.add(
      slab(
        keepCx,
        keepCy,
        keepAlong * 0.55,
        Math.max(1.5, keepAcross * 0.3),
        '#5a5f66',
        1,
        '#5a5f66',
        0
      )
    );
    this.layer.add(group);
  }

  /**
   * Map a handle master-list NAME to a glyph family. Matching is order-sensitive
   * and uses `startsWith` for the single-letter T/C handles so "Casement Handle"
   * (which contains "t handle" as a substring) is NOT mis-classified as a T.
   */
  private _handleGlyphFamily(
    name?: string
  ): 'lever' | 't' | 'c' | 'cockspur' | 'knob' | 'keep' {
    const n = (name || '').trim().toLowerCase();
    if (!n) return 'lever';
    if (n.includes('espage') || n.includes('keep')) return 'keep';
    if (n.includes('popup') || n.includes('touch')) return 'knob';
    if (n.includes('cockspur')) return 'cockspur';
    if (n.startsWith('t handle')) return 't';
    if (n.startsWith('c handle')) return 'c';
    return 'lever';
  }

  /**
   * Resolve a leaf's handle NAME: its own `handleId` when set, else the global
   * `handle_id` control. Empty string when no handle is selected (no glyph).
   */
  private _handleNameForLeaf(node: PaneNode): string {
    const id = node.handleId ?? this.df['handle_id']?.value;
    if (id == null || id === '') return '';
    const found = this.handleList?.find((hd) => String(hd.id) === String(id));
    return found?.name ?? '';
  }

  /**
   * The hinge stile side for an opening direction — i.e. the side the egress
   * chevron apex points to. For tilt & turn it is the side-hung (turn) side.
   */
  private _hingeSideFor(
    direction: string
  ): 'left' | 'right' | 'top' | 'bottom' {
    const dir = (direction || 'Left').toLowerCase();
    if (dir.startsWith('tilt')) return dir.includes('right') ? 'right' : 'left';
    return dir === 'right'
      ? 'right'
      : dir === 'top'
      ? 'top'
      : dir === 'bottom'
      ? 'bottom'
      : 'left';
  }

  /**
   * Draw `count` hinge barrels (knuckles) on the hinge `side`, evenly spaced along
   * the hinge edge and flush against it. Each knuckle is a rounded-rect cylinder
   * with barrel highlight lines and a centre pin, so it reads as a real hinge
   * rather than a tick. Brushed-metal, non-listening; casement only.
   */
  private _drawHingeMarks(
    x: number,
    y: number,
    w: number,
    h: number,
    side: 'left' | 'right' | 'top' | 'bottom',
    count: number
  ) {
    const fill = '#8a9097';
    const outline = '#3a3d42';
    const hi = '#c2c7cd';
    // Cylinder proportions: long along the hinge edge, narrow across it.
    const barrelLen = Math.max(10, Math.min(16, Math.min(w, h) * 0.14));
    const barrelW = Math.max(6, Math.min(9, Math.min(w, h) * 0.08));
    const alongIsX = side === 'top' || side === 'bottom';
    for (let i = 1; i <= count; i++) {
      const f = i / (count + 1);
      // Knuckle centre: f along the hinge edge, flush against it (sitting just
      // inside the sash on the hinge stile).
      let bcx: number, bcy: number;
      switch (side) {
        case 'right':
          bcx = x + w - barrelW / 2;
          bcy = y + h * f;
          break;
        case 'top':
          bcx = x + w * f;
          bcy = y + barrelW / 2;
          break;
        case 'bottom':
          bcx = x + w * f;
          bcy = y + h - barrelW / 2;
          break;
        case 'left':
        default:
          bcx = x + barrelW / 2;
          bcy = y + h * f;
          break;
      }
      const wd = alongIsX ? barrelLen : barrelW;
      const ht = alongIsX ? barrelW : barrelLen;
      const group = new Konva.Group({ listening: false });
      // Cylinder body.
      group.add(
        new Konva.Rect({
          x: bcx - wd / 2,
          y: bcy - ht / 2,
          width: wd,
          height: ht,
          fill,
          stroke: outline,
          strokeWidth: 1,
          cornerRadius: barrelW / 2,
          listening: false,
        })
      );
      // Two thin highlight lines running the length of the barrel.
      const off = barrelW * 0.22;
      if (alongIsX) {
        group.add(
          new Konva.Line({ points: [bcx - wd / 2 + 2, bcy - off, bcx + wd / 2 - 2, bcy - off], stroke: hi, strokeWidth: 1, listening: false })
        );
        group.add(
          new Konva.Line({ points: [bcx - wd / 2 + 2, bcy + off, bcx + wd / 2 - 2, bcy + off], stroke: hi, strokeWidth: 1, listening: false })
        );
      } else {
        group.add(
          new Konva.Line({ points: [bcx - off, bcy - ht / 2 + 2, bcx - off, bcy + ht / 2 - 2], stroke: hi, strokeWidth: 1, listening: false })
        );
        group.add(
          new Konva.Line({ points: [bcx + off, bcy - ht / 2 + 2, bcx + off, bcy + ht / 2 - 2], stroke: hi, strokeWidth: 1, listening: false })
        );
      }
      // Centre pin.
      group.add(
        new Konva.Circle({ x: bcx, y: bcy, radius: Math.max(1, barrelW * 0.16), fill: outline, listening: false })
      );
      this.layer.add(group);
    }
  }

  private clearLayerChildren() {
    this.layer.removeChildren();
  }

  private _initPallaForm(): FormGroup {
    let fg = this._fb.group({
      height: new FormControl('', [Validators.required]),
      width: new FormControl('', [Validators.required]),
    });
    return fg;
  }

  /**
   * Resize the selected portion of a mullion split. State-driven: instead of
   * mutating shape geometry, this adjusts the selected child's size `fraction`
   * within its parent split (giving the remainder to its sibling) and redraws.
   * The mullion bar therefore always lands at the new boundary by construction.
   */
  updateAdjacentRects() {
    if (!this.selectedPaneId) {
      this._toastService.showError('Please select area first');
      return;
    }
    const node = this._findPane(this.selectedPaneId, this.rootPane);
    const parent = node ? this._findParent(node.id, this.rootPane) : null;
    if (!node || !parent || !parent.split) {
      this._toastService.showError('Please select a divided portion first');
      return;
    }
    const split = parent.split;
    const isVertical = split.direction === 'vertical';
    const newSize = isVertical
      ? Number(this.pallaForm.get('width')?.value)
      : Number(this.pallaForm.get('height')?.value);
    if (!newSize || newSize <= 0) {
      this._toastService.showError('Please enter a valid size');
      return;
    }
    if (isVertical && newSize > Number(this.form.get('width')?.value)) {
      this._toastService.showError('Please incress main width');
      return;
    }
    if (!isVertical && newSize > Number(this.form.get('height')?.value)) {
      this._toastService.showError('Please incress main height');
      return;
    }
    // Available mm shared by this split's children (interior minus dividers).
    const avail =
      split._availMm ?? (isVertical ? node._wMm : node._hMm) ?? newSize;
    if (newSize >= avail) {
      this._toastService.showError(
        isVertical ? 'Please incress main width' : 'Please incress main height'
      );
      return;
    }
    const idx = split.children.findIndex((c) => c.id === node.id);
    const targetFrac = Math.min(0.95, Math.max(0.05, newSize / avail));
    const remaining = 1 - targetFrac;
    // Spread the remainder across the other children in proportion to their
    // current shares (exact for the typical two-pane mullion split).
    const others = split.fractions.reduce(
      (s, f, i) => (i === idx ? s : s + f),
      0
    );
    const siblingCount = split.children.length - 1;
    split.fractions = split.fractions.map((f, i) =>
      i === idx
        ? targetFrac
        : others > 0
        ? remaining * (f / others)
        : remaining / siblingCount
    );

    this.pallaForm.reset();
    this.pallaForm.updateValueAndValidity();
    // Clear selection + dependent flags and redraw from the updated state.
    this._deselectPane();
  }

  /**
   * Design Functions end
   */
}

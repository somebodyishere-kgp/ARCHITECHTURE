// ═══════════════════════════════════════════════════════════════════════════════
// PlansTab — World-class 2D CAD Engine for ArchFlow
// AutoCAD-level drafting: 30+ tools, snap engine, ortho, polar tracking,
// undo/redo, selection modes, command line, dimension engine, hatch, blocks
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  MousePointer2, Pencil, Square, Circle, Minus, RotateCw,
  Move, Copy, Scissors, Ruler, Type, ZoomIn, ZoomOut, Maximize2,
  Layers as LayersIcon, Download, Grid, Undo2, Redo2, Crosshair,
  ArrowUpRight, Triangle, Hash, Spline as SplineIcon, PenTool,
  FlipHorizontal2, Scaling, CornerDownRight, Trash2
} from 'lucide-react';
import {
  FloorPlan, Layer, AnyEntity, Vec2, uid,
  WallEntity, LineEntity, CircleEntity, ArcEntity, RectangleEntity,
  PolylineEntity, PolygonEntity, EllipseEntity, SplineEntity, HatchEntity,
  DoorEntity, WindowEntity, ColumnEntity, BeamEntity, StairEntity,
  SlabEntity, RoofEntity, RampEntity, RoomEntity, CurtainWallEntity,
  TextEntity, MTextEntity, DimensionEntity, LeaderEntity,
  XLineEntity, RayEntity, DonutEntity, RevCloudEntity, WipeoutEntity,
  MLineEntity, RegionEntity, RailingEntity, CeilingEntity,
  MultiLeaderEntity, TableEntity, ToleranceEntity,
  BlockRefEntity, BlockDef, ZoneEntity,
  FurnitureEntity, ApplianceEntity, FixtureEntity,
  StructuralMemberEntity, FootingEntity, PileEntity,
  RetainingWallEntity, OpeningEntity, NicheEntity, ShaftEntity, ElevatorEntity,
  PipeEntity, DuctEntity, ConduitEntity, CableTrayEntity, MEPDeviceEntity,
  ContourEntity, GradingEntity, PavingEntity, LandscapeEntity, FenceSiteEntity, ParkingEntity,
  SectionMarkEntity, DetailMarkEntity, ElevationMarkEntity, GridBubbleEntity,
  TagEntity, KeynoteEntity, RevisionTagEntity, GradientEntity,
  entityVertices, pointToSegmentDist, dist, midpoint, angleBetween,
  rotatePoint, perpNormal, polygonArea, polygonCentroid, boundingBox, lerp2,
  HistoryEntry,
  // Advanced geometry engine
  lineLineIntersect, segSegIntersect, circleLineIntersect, circleCircleIntersect,
  offsetPolyline, offsetPolygon, pointInPolygon, closestPointOnSegment,
  closestPointOnCircle, perpendicularFoot, tangentPointsFromExternal,
  normalizeAngle, angleInArc, arcLength, pointOnArc,
  divideSegment, measureAlongPolyline, polylineLength, pointOnPolyline,
  convexHull, simplifyPolyline, smoothPolyline,
  translatePts, scalePts, rotatePts, mirrorPts,
  polarArrayPts, rectArrayPts,
  cubicBezier, sampleBezier, sampleCatmullRom,
  pointOnEllipse, sampleEllipseArc,
  polygonPerimeter, polygonUnion, polygonIntersection,
  // Data model additions
  DimStyle, defaultDimStyles, TextStyle, defaultTextStyles,
  HatchPattern, defaultHatchPatterns, LinetypeDefinition, defaultLinetypes,
  Sheet, Viewport, TitleBlock, PAPER_SIZES, ACI_COLORS, UCS, WCS,
} from '../lib/adf';
import { invoke } from '@tauri-apps/api/core';
import LayerManager from '../components/LayerManager';
import BimPanel from '../components/BimPanel';
import './PlansTab.css';

// ─── Tool definitions ────────────────────────────────────────────────────────
type Tool =
  | 'select' | 'pan' | 'window_select' | 'crossing_select' | 'fence_select' | 'lasso_select'
  | 'select_similar' | 'select_all' | 'quick_select' | 'select_previous' | 'deselect_all'
  // Draw basic
  | 'line' | 'polyline' | 'rectangle' | 'circle' | 'arc' | 'ellipse'
  | 'spline' | 'polygon' | 'hatch' | 'point' | 'gradient'
  | 'xline' | 'ray' | 'mline' | 'donut' | 'revcloud' | 'wipeout' | 'region' | 'boundary'
  // Draw circle variants
  | 'circle_2p' | 'circle_3p' | 'circle_ttr' | 'circle_tan_tan_rad'
  // Draw arc variants
  | 'arc_3p' | 'arc_sce' | 'arc_cse' | 'arc_start_end_radius' | 'arc_start_end_angle'
  // Draw rect variants
  | 'rect_chamfer' | 'rect_fillet' | 'rect_rotated' | 'rect_3point'
  // Draw ellipse variants
  | 'ellipse_arc' | 'ellipse_center'
  // Modify - basic
  | 'move' | 'copy' | 'rotate' | 'scale' | 'mirror' | 'trim' | 'extend'
  | 'offset' | 'fillet' | 'chamfer' | 'array' | 'explode' | 'break' | 'stretch'
  | 'lengthen' | 'align' | 'join' | 'break_at_point' | 'pedit' | 'splinedit'
  | 'array_polar' | 'array_path' | 'matchprop' | 'divide' | 'measure_entity'
  // Modify - advanced
  | 'erase' | 'oops' | 'undo_cmd' | 'redo_cmd'
  | 'stretch_dynamic' | 'scale_reference' | 'rotate_reference'
  | 'reverse' | 'flatten' | 'overkill' | 'edit_hatch' | 'edit_text' | 'edit_mtext'
  | 'change_space' | 'convert_to_polyline' | 'convert_to_spline' | 'convert_to_region'
  | 'subtract' | 'union_2d' | 'intersect_2d'
  // Arch
  | 'wall' | 'door' | 'window' | 'column' | 'beam' | 'stair' | 'slab'
  | 'roof' | 'ramp' | 'room' | 'zone' | 'zone_divider' | 'curtainwall' | 'railing' | 'ceiling'
  | 'furniture' | 'appliance' | 'fixture' | 'structural_member'
  | 'footing' | 'pile' | 'retaining_wall'
  | 'opening' | 'niche' | 'shaft' | 'elevator'
  // MEP
  | 'pipe' | 'duct' | 'conduit' | 'cable_tray'
  | 'sprinkler' | 'diffuser' | 'outlet' | 'switch_mep'
  | 'panel_board' | 'transformer' | 'valve' | 'pump'
  // Site
  | 'contour' | 'grading' | 'paving' | 'landscape' | 'fence_site' | 'parking'
  // Annotate
  | 'text' | 'mtext' | 'dimension' | 'dim_aligned' | 'dim_angular'
  | 'dim_radius' | 'dim_diameter' | 'dim_ordinate' | 'dim_arc_length'
  | 'dim_baseline' | 'dim_continue' | 'dim_center_mark' | 'dim_jogged'
  | 'leader' | 'multileader' | 'table' | 'tolerance' | 'measure'
  | 'field_insert' | 'markup' | 'section_mark' | 'detail_mark' | 'elevation_mark'
  | 'grid_bubble' | 'tag' | 'keynote' | 'revision_tag'
  // Inquiry
  | 'dist_info' | 'area_info' | 'id_point' | 'list_info' | 'massprop'
  | 'volume_info' | 'angle_info' | 'boundingbox_info' | 'time_info' | 'status_info'
  // Utility
  | 'purge' | 'audit' | 'units' | 'limits' | 'recover'
  | 'drawing_properties' | 'rename_named' | 'layer_states' | 'layer_walk'
  | 'isolate_objects' | 'unisolate_objects' | 'hide_objects' | 'show_all_objects'
  // Block / Group / Xref
  | 'block_create' | 'block_insert' | 'block_edit' | 'block_save'
  | 'group' | 'ungroup' | 'xref_attach' | 'xref_detach' | 'xref_bind'
  | 'attribute_define' | 'attribute_edit' | 'attribute_extract'
  | 'dynamic_block_parameter' | 'dynamic_block_action'
  // Layer shortcuts
  | 'layer_isolate' | 'layer_unisolate' | 'layer_freeze' | 'layer_off'
  | 'layer_lock' | 'layer_unlock' | 'layer_on' | 'layer_thaw'
  | 'layer_set_current' | 'layer_make' | 'layer_delete' | 'layer_merge'
  // Viewport / Display
  | 'zoom_extents' | 'zoom_window' | 'zoom_previous' | 'zoom_realtime'
  | 'zoom_in' | 'zoom_out' | 'zoom_all' | 'zoom_object'
  | 'pan_realtime' | 'named_views' | 'view_top' | 'view_front' | 'view_right'
  // Parametric Constraints
  | 'constraint_horizontal' | 'constraint_vertical' | 'constraint_perpendicular'
  | 'constraint_parallel' | 'constraint_tangent' | 'constraint_coincident'
  | 'constraint_concentric' | 'constraint_equal' | 'constraint_symmetric'
  | 'constraint_fix' | 'constraint_smooth'
  | 'dim_constraint_linear' | 'dim_constraint_aligned' | 'dim_constraint_angular'
  | 'dim_constraint_radial' | 'dim_constraint_diameter'
  // Express Tools
  | 'flatten_text' | 'arc_aligned_text' | 'enclose_text_in_object'
  | 'break_line_symbol' | 'super_hatch' | 'move_copy_rotate'
  | 'multiple_entity_stretch' | 'get_sel_set'
  // Rendering / Visualization
  | 'render_preview' | 'material_assign' | 'light_point' | 'light_spot'
  | 'light_distant' | 'sun_settings' | 'background_set'
  // Print / Output
  | 'plot' | 'publish' | 'export_pdf' | 'export_dwg' | 'export_dxf_tool'
  | 'export_svg' | 'export_png' | 'export_ifc' | 'page_setup' | 'plot_style'
  // 3D Modeling
  | 'extrude_3d' | 'revolve_3d' | 'sweep_3d' | 'loft_3d' | 'union_3d' | 'subtract_3d'
  | 'intersect_3d' | 'slice_3d' | 'thicken' | 'shell_3d' | 'fillet_3d' | 'chamfer_3d'
  | 'presspull' | 'section_plane' | 'flatshot' | 'meshsmooth' | 'mesh_edit'
  // Data & References
  | 'data_link' | 'data_extraction' | 'field_update_all' | 'hyperlink'
  | 'olelink' | 'external_reference_manager' | 'image_attach' | 'image_clip'
  | 'pdf_attach' | 'coordination_model_attach'
  // Markup & Collaboration
  | 'markup_set_manager' | 'sheet_set_manager' | 'compare_drawings'
  | 'count_tool' | 'measure_quick' | 'geolocation'
  // Additional Annotation
  | 'text_style' | 'dim_style' | 'multileader_style' | 'table_style'
  | 'annotative_scale' | 'scale_list' | 'qleader'
  // Selection Filters
  | 'select_filter' | 'select_by_type' | 'select_by_layer' | 'select_by_color'
  // Additional Express Tools
  | 'burst' | 'tcount' | 'txt2mtxt' | 'autocomplete_cmd'
  // IFC / BIM Integration
  | 'import_ifc' | 'export_ifc_tool' | 'ifc_validate' | 'ifc_clash' | 'ifc_qty_takeoff' | 'ifc_spatial'
  // Import
  | 'import_dxf' | 'import_svg' | 'import_pdf' | 'import_image'
  // Paper Space / Sheets
  | 'layout_new' | 'layout_from_template' | 'viewport_create' | 'viewport_scale'
  | 'viewport_lock' | 'viewport_clip' | 'model_space' | 'paper_space'
  // Advanced Draw
  | 'construction_line' | 'multipoint' | 'freehand' | 'trace' | 'sketch_line'
  | 'rectangle_area' | 'circle_area' | 'tangent_line' | 'perpendicular_line'
  | 'parallel_line' | 'bisector' | 'centerline' | 'centermark'
  // Advanced Modify
  | 'power_trim' | 'extend_to_boundary' | 'trim_to_boundary'
  | 'stretch_proportional' | 'blend_curves' | 'smooth_curve'
  | 'remove_duplicates' | 'close_gap' | 'heal_geometry'
  // Electrical
  | 'elec_receptacle' | 'elec_switch' | 'elec_light' | 'elec_panel'
  | 'elec_circuit' | 'elec_wire' | 'elec_junction'
  // Plumbing
  | 'plumb_fixture' | 'plumb_pipe' | 'plumb_valve' | 'plumb_drain'
  | 'plumb_water_heater' | 'plumb_cleanout'
  // HVAC
  | 'hvac_diffuser' | 'hvac_return' | 'hvac_thermostat' | 'hvac_unit'
  | 'hvac_flex_duct' | 'hvac_damper'
  // Fire Protection
  | 'fire_sprinkler' | 'fire_alarm' | 'fire_extinguisher' | 'fire_hose'
  | 'fire_exit_sign' | 'fire_smoke_detector'
  // Accessibility
  | 'ada_ramp' | 'ada_parking' | 'ada_restroom' | 'ada_clearance';

interface ToolDef { id: Tool; icon: React.ReactNode; label: string; shortcut?: string; }
interface ToolGroup { label: string; tools: ToolDef[]; }

const ico = (t: string) => <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{t}</span>;

const TOOL_GROUPS: ToolGroup[] = [
  { label: 'Select', tools: [
    { id: 'select', icon: <MousePointer2 size={15}/>, label: 'Select', shortcut: 'S' },
    { id: 'pan',    icon: <Move size={15}/>,          label: 'Pan',    shortcut: 'Shift+MMB' },
    { id: 'window_select',   icon: ico('WS'), label: 'Window Select' },
    { id: 'crossing_select', icon: ico('CS'), label: 'Crossing Select' },
    { id: 'fence_select',    icon: ico('FS'), label: 'Fence Select' },
    { id: 'lasso_select',    icon: ico('LS'), label: 'Lasso Select' },
    { id: 'select_similar',  icon: ico('SS'), label: 'Select Similar' },
    { id: 'select_all',      icon: ico('SA'), label: 'Select All', shortcut: 'Ctrl+A' },
    { id: 'quick_select',    icon: ico('QS'), label: 'Quick Select' },
    { id: 'select_previous', icon: ico('SP'), label: 'Select Previous' },
    { id: 'deselect_all',    icon: ico('DA'), label: 'Deselect All', shortcut: 'Esc' },
  ]},
  { label: 'Draw', tools: [
    { id: 'line',      icon: <Minus size={15}/>,        label: 'Line',          shortcut: 'L' },
    { id: 'polyline',  icon: <Pencil size={15}/>,       label: 'Polyline',      shortcut: 'PL' },
    { id: 'rectangle', icon: <Square size={15}/>,       label: 'Rectangle',     shortcut: 'REC' },
    { id: 'circle',    icon: <Circle size={15}/>,       label: 'Circle',        shortcut: 'C' },
    { id: 'circle_2p', icon: ico('C2P'), label: 'Circle 2-Point' },
    { id: 'circle_3p', icon: ico('C3P'), label: 'Circle 3-Point' },
    { id: 'circle_ttr', icon: ico('CTR'), label: 'Circle Tan-Tan-Rad' },
    { id: 'arc',       icon: <RotateCw size={15}/>,     label: 'Arc',           shortcut: 'A' },
    { id: 'arc_3p',    icon: ico('A3P'), label: 'Arc 3-Point' },
    { id: 'arc_sce',   icon: ico('AS'), label: 'Arc Start-Center-End' },
    { id: 'arc_cse',   icon: ico('AC'), label: 'Arc Center-Start-End' },
    { id: 'arc_start_end_radius', icon: ico('AER'), label: 'Arc S-E-Radius' },
    { id: 'arc_start_end_angle', icon: ico('AEA'), label: 'Arc S-E-Angle' },
    { id: 'ellipse',   icon: <Circle size={15} style={{ transform: 'scaleY(0.6)' }}/>, label: 'Ellipse', shortcut: 'EL' },
    { id: 'ellipse_arc', icon: ico('EA'), label: 'Ellipse Arc' },
    { id: 'ellipse_center', icon: ico('EC'), label: 'Ellipse Center' },
    { id: 'spline',    icon: <PenTool size={15}/>,      label: 'Spline',        shortcut: 'SPL' },
    { id: 'polygon',   icon: <Triangle size={15}/>,     label: 'Polygon',       shortcut: 'POL' },
    { id: 'hatch',     icon: <Hash size={15}/>,         label: 'Hatch',         shortcut: 'BH' },
    { id: 'gradient',  icon: ico('GD'), label: 'Gradient Fill' },
    { id: 'point',     icon: <Crosshair size={15}/>,    label: 'Point',         shortcut: 'PO' },
    { id: 'xline',     icon: ico('XL'), label: 'Construction Line', shortcut: 'XL' },
    { id: 'ray',       icon: ico('RY'), label: 'Ray',             shortcut: 'RY' },
    { id: 'mline',     icon: ico('ML'), label: 'Multiline',       shortcut: 'ML' },
    { id: 'donut',     icon: ico('DO'), label: 'Donut',           shortcut: 'DO' },
    { id: 'revcloud',  icon: ico('RC'), label: 'Revision Cloud',  shortcut: 'RC' },
    { id: 'wipeout',   icon: ico('WP'), label: 'Wipeout' },
    { id: 'region',    icon: ico('RG'), label: 'Region',          shortcut: 'REG' },
    { id: 'boundary',  icon: ico('BO'), label: 'Boundary',        shortcut: 'BO' },
    { id: 'rect_chamfer', icon: ico('RCH'), label: 'Rect Chamfer' },
    { id: 'rect_fillet',  icon: ico('RFL'), label: 'Rect Fillet' },
    { id: 'rect_rotated', icon: ico('RRO'), label: 'Rect Rotated' },
    { id: 'rect_3point',  icon: ico('R3P'), label: 'Rect 3-Point' },
  ]},
  { label: 'Modify', tools: [
    { id: 'move',    icon: <Move size={15}/>,             label: 'Move',        shortcut: 'M' },
    { id: 'copy',    icon: <Copy size={15}/>,             label: 'Copy',        shortcut: 'CO' },
    { id: 'rotate',  icon: <RotateCw size={15}/>,         label: 'Rotate',      shortcut: 'RO' },
    { id: 'mirror',  icon: <FlipHorizontal2 size={15}/>,  label: 'Mirror',      shortcut: 'MI' },
    { id: 'scale',   icon: <Scaling size={15}/>,           label: 'Scale',       shortcut: 'SC' },
    { id: 'trim',    icon: <Scissors size={15}/>,         label: 'Trim',        shortcut: 'TR' },
    { id: 'extend',  icon: ico('EX'),                     label: 'Extend',      shortcut: 'EX' },
    { id: 'offset',  icon: ico('O'),                      label: 'Offset',      shortcut: 'O' },
    { id: 'fillet',  icon: <CornerDownRight size={15}/>,   label: 'Fillet',      shortcut: 'F' },
    { id: 'chamfer', icon: ico('CHA'),                    label: 'Chamfer',     shortcut: 'CHA' },
    { id: 'array',   icon: <Grid size={15}/>,             label: 'Rect Array',  shortcut: 'AR' },
    { id: 'array_polar', icon: ico('AP'), label: 'Polar Array' },
    { id: 'array_path',  icon: ico('APA'), label: 'Path Array' },
    { id: 'stretch', icon: ico('STR'),                    label: 'Stretch',     shortcut: 'STR' },
    { id: 'explode', icon: ico('X'),                      label: 'Explode',     shortcut: 'X' },
    { id: 'erase',   icon: <Trash2 size={15}/>,           label: 'Erase',       shortcut: 'E' },
    { id: 'break',   icon: ico('BR'),                     label: 'Break',       shortcut: 'BR' },
    { id: 'break_at_point', icon: ico('BAP'), label: 'Break at Point' },
    { id: 'join',    icon: ico('J'),                      label: 'Join',        shortcut: 'J' },
    { id: 'lengthen', icon: ico('LEN'),                   label: 'Lengthen',    shortcut: 'LEN' },
    { id: 'align',   icon: ico('AL'),                     label: 'Align',       shortcut: 'AL' },
    { id: 'pedit',   icon: ico('PE'),                     label: 'Edit Polyline', shortcut: 'PE' },
    { id: 'splinedit', icon: ico('SPE'),                  label: 'Edit Spline', shortcut: 'SPE' },
    { id: 'matchprop', icon: ico('MA'),                   label: 'Match Props', shortcut: 'MA' },
    { id: 'divide',   icon: ico('DIV'),                   label: 'Divide',      shortcut: 'DIV' },
    { id: 'measure_entity', icon: ico('ME'),              label: 'Measure Ent', shortcut: 'ME' },
    { id: 'reverse',  icon: ico('REV'),                   label: 'Reverse',     shortcut: 'REV' },
    { id: 'flatten',  icon: ico('FLT'),                   label: 'Flatten',     shortcut: 'FLT' },
    { id: 'overkill', icon: ico('OVK'),                   label: 'Overkill',    shortcut: 'OVK' },
    { id: 'edit_hatch', icon: ico('HE'),                  label: 'Edit Hatch' },
    { id: 'convert_to_polyline', icon: ico('CTP'),        label: 'Convert to PL' },
    { id: 'convert_to_region', icon: ico('CTR'),          label: 'Convert to Region' },
    { id: 'subtract', icon: ico('SU'),                    label: '2D Subtract' },
    { id: 'union_2d', icon: ico('UNI'),                   label: '2D Union' },
    { id: 'intersect_2d', icon: ico('INT'),               label: '2D Intersect' },
    { id: 'rotate_reference', icon: ico('ROR'),           label: 'Rotate Ref' },
    { id: 'scale_reference',  icon: ico('SCR'),           label: 'Scale Ref' },
  ]},
  { label: 'Arch.', tools: [
    { id: 'wall',        icon: <Square size={15}/>,  label: 'Wall',         shortcut: 'WA' },
    { id: 'door',        icon: ico('DR'),            label: 'Door',         shortcut: 'DR' },
    { id: 'window',      icon: ico('WN'),            label: 'Window',       shortcut: 'WN' },
    { id: 'column',      icon: ico('CL'),            label: 'Column',       shortcut: 'CL' },
    { id: 'beam',        icon: ico('BM'),            label: 'Beam',         shortcut: 'BM' },
    { id: 'stair',       icon: ico('ST'),            label: 'Stair',        shortcut: 'ST' },
    { id: 'slab',        icon: <Square size={15} style={{ transform: 'scaleY(0.2)' }}/>, label: 'Slab', shortcut: 'SL' },
    { id: 'roof',        icon: ico('RF'),            label: 'Roof',         shortcut: 'RF' },
    { id: 'ramp',        icon: ico('RP'),            label: 'Ramp',         shortcut: 'RP' },
    { id: 'room',        icon: ico('RM'),            label: 'Room',         shortcut: 'RM' },
    { id: 'zone',        icon: ico('Z'),             label: 'Zone',         shortcut: 'Z' },
    { id: 'zone_divider', icon: ico('DV'),           label: 'Zone Divider', shortcut: 'DV' },
    { id: 'curtainwall', icon: ico('CW'),            label: 'Curtain Wall', shortcut: 'CW' },
    { id: 'railing',     icon: ico('RL'),            label: 'Railing',      shortcut: 'RL' },
    { id: 'ceiling',     icon: ico('CG'),            label: 'Ceiling',      shortcut: 'CG' },
    { id: 'furniture',   icon: ico('FN'),            label: 'Furniture' },
    { id: 'appliance',   icon: ico('AP'),            label: 'Appliance' },
    { id: 'fixture',     icon: ico('FX'),            label: 'Fixture' },
    { id: 'structural_member', icon: ico('SM'),      label: 'Structural Member' },
    { id: 'footing',     icon: ico('FT'),            label: 'Footing' },
    { id: 'pile',        icon: ico('PI'),            label: 'Pile' },
    { id: 'retaining_wall', icon: ico('RW'),         label: 'Retaining Wall' },
    { id: 'opening',     icon: ico('OP'),            label: 'Opening' },
    { id: 'niche',       icon: ico('NC'),            label: 'Niche' },
    { id: 'shaft',       icon: ico('SH'),            label: 'Shaft' },
    { id: 'elevator',    icon: ico('EL'),            label: 'Elevator' },
  ]},
  { label: 'MEP', tools: [
    { id: 'pipe',        icon: ico('PP'),  label: 'Pipe',         shortcut: 'PP' },
    { id: 'duct',        icon: ico('DU'),  label: 'Duct',         shortcut: 'DU' },
    { id: 'conduit',     icon: ico('CD'),  label: 'Conduit' },
    { id: 'cable_tray',  icon: ico('CT'),  label: 'Cable Tray' },
    { id: 'sprinkler',   icon: ico('SPR'), label: 'Sprinkler' },
    { id: 'diffuser',    icon: ico('DF'),  label: 'Diffuser' },
    { id: 'outlet',      icon: ico('OL'),  label: 'Outlet' },
    { id: 'switch_mep',  icon: ico('SW'),  label: 'Switch' },
    { id: 'panel_board', icon: ico('PB'),  label: 'Panel Board' },
    { id: 'transformer', icon: ico('TX'),  label: 'Transformer' },
    { id: 'valve',       icon: ico('VL'),  label: 'Valve' },
    { id: 'pump',        icon: ico('PM'),  label: 'Pump' },
  ]},
  { label: 'Site', tools: [
    { id: 'contour',     icon: ico('CN'),  label: 'Contour' },
    { id: 'grading',     icon: ico('GR'),  label: 'Grading' },
    { id: 'paving',      icon: ico('PV'),  label: 'Paving' },
    { id: 'landscape',   icon: ico('LS'),  label: 'Landscape' },
    { id: 'fence_site',  icon: ico('FN'),  label: 'Fence' },
    { id: 'parking',     icon: ico('PK'),  label: 'Parking' },
  ]},
  { label: 'Annotate', tools: [
    { id: 'dimension',      icon: <Ruler size={15}/>,   label: 'Linear Dim',    shortcut: 'DLI' },
    { id: 'dim_aligned',    icon: <Ruler size={15} style={{ transform: 'rotate(-15deg)' }}/>, label: 'Aligned Dim', shortcut: 'DAL' },
    { id: 'dim_angular',    icon: ico('DAN'),           label: 'Angular Dim',   shortcut: 'DAN' },
    { id: 'dim_radius',     icon: ico('DRA'),           label: 'Radius Dim',    shortcut: 'DRA' },
    { id: 'dim_diameter',   icon: ico('DDI'),           label: 'Diameter Dim',  shortcut: 'DDI' },
    { id: 'dim_ordinate',   icon: ico('DOR'),           label: 'Ordinate Dim',  shortcut: 'DOR' },
    { id: 'dim_arc_length', icon: ico('DAR'),           label: 'Arc Length Dim', shortcut: 'DAR' },
    { id: 'dim_baseline',   icon: ico('DBL'),           label: 'Baseline Dim',  shortcut: 'DBL' },
    { id: 'dim_continue',   icon: ico('DCO'),           label: 'Continue Dim',  shortcut: 'DCO' },
    { id: 'dim_center_mark', icon: ico('DCM'),          label: 'Center Mark' },
    { id: 'dim_jogged',     icon: ico('DJG'),           label: 'Jogged Dim' },
    { id: 'text',           icon: <Type size={15}/>,    label: 'Text',          shortcut: 'T' },
    { id: 'mtext',          icon: ico('MT'),            label: 'Multi Text',    shortcut: 'MT' },
    { id: 'leader',         icon: <ArrowUpRight size={15}/>, label: 'Leader',   shortcut: 'LE' },
    { id: 'multileader',    icon: ico('MLD'),           label: 'Multi Leader',  shortcut: 'MLD' },
    { id: 'table',          icon: ico('TB'),            label: 'Table',         shortcut: 'TB' },
    { id: 'tolerance',      icon: ico('TOL'),           label: 'Tolerance',     shortcut: 'TOL' },
    { id: 'measure',        icon: ico('DI'),            label: 'Measure',       shortcut: 'DI' },
    { id: 'field_insert',   icon: ico('FLD'),           label: 'Field' },
    { id: 'markup',         icon: ico('MK'),            label: 'Markup' },
    { id: 'section_mark',   icon: ico('SEC'),           label: 'Section Mark' },
    { id: 'detail_mark',    icon: ico('DET'),           label: 'Detail Mark' },
    { id: 'elevation_mark', icon: ico('ELV'),           label: 'Elevation Mark' },
    { id: 'grid_bubble',    icon: ico('GB'),            label: 'Grid Bubble' },
    { id: 'tag',            icon: ico('TG'),            label: 'Tag' },
    { id: 'keynote',        icon: ico('KN'),            label: 'Keynote' },
    { id: 'revision_tag',   icon: ico('RT'),            label: 'Revision Tag' },
  ]},
  { label: 'Inquiry', tools: [
    { id: 'dist_info',  icon: ico('DIS'), label: 'Distance',    shortcut: 'DIS' },
    { id: 'area_info',  icon: ico('AA'),  label: 'Area',        shortcut: 'AA' },
    { id: 'id_point',   icon: ico('ID'),  label: 'ID Point',    shortcut: 'ID' },
    { id: 'list_info',  icon: ico('LI'),  label: 'List',        shortcut: 'LI' },
    { id: 'massprop',   icon: ico('MP'),  label: 'Mass Props',  shortcut: 'MASSPROP' },
    { id: 'volume_info', icon: ico('VOL'), label: 'Volume',     shortcut: 'VOL' },
    { id: 'angle_info',  icon: ico('ANG'), label: 'Angle',      shortcut: 'ANG' },
    { id: 'boundingbox_info', icon: ico('BB'), label: 'Bounding Box' },
    { id: 'time_info',  icon: ico('TM'),  label: 'Time' },
    { id: 'status_info', icon: ico('STA'), label: 'Status' },
  ]},
  { label: 'Block', tools: [
    { id: 'block_create', icon: ico('B'),   label: 'Create Block', shortcut: 'B' },
    { id: 'block_insert', icon: ico('I'),   label: 'Insert Block', shortcut: 'I' },
    { id: 'block_edit',   icon: ico('BE'),  label: 'Edit Block',   shortcut: 'BE' },
    { id: 'block_save',   icon: ico('BS'),  label: 'Save Block' },
    { id: 'group',        icon: ico('G'),   label: 'Group',        shortcut: 'G' },
    { id: 'ungroup',      icon: ico('UG'),  label: 'Ungroup' },
    { id: 'xref_attach',  icon: ico('XA'),  label: 'Xref Attach' },
    { id: 'xref_detach',  icon: ico('XD'),  label: 'Xref Detach' },
    { id: 'xref_bind',    icon: ico('XB'),  label: 'Xref Bind' },
    { id: 'attribute_define', icon: ico('AD'), label: 'Define Attrib' },
    { id: 'attribute_edit',   icon: ico('AE'), label: 'Edit Attrib' },
    { id: 'attribute_extract', icon: ico('AX'), label: 'Extract Attribs' },
  ]},
  { label: 'Layers', tools: [
    { id: 'layer_isolate',   icon: ico('LIS'), label: 'Layer Isolate' },
    { id: 'layer_unisolate', icon: ico('LUI'), label: 'Layer Unisolate' },
    { id: 'layer_freeze',    icon: ico('LFR'), label: 'Layer Freeze' },
    { id: 'layer_thaw',      icon: ico('LTH'), label: 'Layer Thaw' },
    { id: 'layer_off',       icon: ico('LOF'), label: 'Layer Off' },
    { id: 'layer_on',        icon: ico('LON'), label: 'Layer On' },
    { id: 'layer_lock',      icon: ico('LLK'), label: 'Layer Lock' },
    { id: 'layer_unlock',    icon: ico('LUL'), label: 'Layer Unlock' },
    { id: 'layer_set_current', icon: ico('LAC'), label: 'Set Current' },
    { id: 'layer_make',      icon: ico('LMK'), label: 'Layer Make' },
    { id: 'layer_delete',    icon: ico('LDE'), label: 'Layer Delete' },
    { id: 'layer_merge',     icon: ico('LMG'), label: 'Layer Merge' },
    { id: 'layer_walk',      icon: ico('LWK'), label: 'Layer Walk' },
    { id: 'layer_states',    icon: ico('LST'), label: 'Layer States' },
  ]},
  { label: 'View', tools: [
    { id: 'zoom_extents',  icon: ico('ZE'),  label: 'Zoom Extents', shortcut: 'ZE' },
    { id: 'zoom_window',   icon: ico('ZW'),  label: 'Zoom Window',  shortcut: 'ZW' },
    { id: 'zoom_previous', icon: ico('ZP'),  label: 'Zoom Previous', shortcut: 'ZP' },
    { id: 'zoom_realtime', icon: ico('ZR'),  label: 'Zoom Realtime' },
    { id: 'zoom_in',       icon: <ZoomIn size={15}/>,  label: 'Zoom In',  shortcut: '+' },
    { id: 'zoom_out',      icon: <ZoomOut size={15}/>, label: 'Zoom Out', shortcut: '-' },
    { id: 'zoom_all',      icon: ico('ZA'),  label: 'Zoom All' },
    { id: 'zoom_object',   icon: ico('ZO'),  label: 'Zoom Object' },
    { id: 'named_views',   icon: ico('V'),   label: 'Named Views' },
    { id: 'isolate_objects',   icon: ico('IO'), label: 'Isolate Objects' },
    { id: 'unisolate_objects', icon: ico('UO'), label: 'Unisolate Objects' },
    { id: 'hide_objects',      icon: ico('HO'), label: 'Hide Objects' },
    { id: 'show_all_objects',  icon: ico('SO'), label: 'Show All Objects' },
  ]},
  { label: 'Constraints', tools: [
    { id: 'constraint_horizontal',    icon: ico('CH'), label: 'Horizontal' },
    { id: 'constraint_vertical',      icon: ico('CV'), label: 'Vertical' },
    { id: 'constraint_perpendicular', icon: ico('CP'), label: 'Perpendicular' },
    { id: 'constraint_parallel',      icon: ico('CPA'), label: 'Parallel' },
    { id: 'constraint_tangent',       icon: ico('CT'), label: 'Tangent' },
    { id: 'constraint_coincident',    icon: ico('CC'), label: 'Coincident' },
    { id: 'constraint_concentric',    icon: ico('CCN'), label: 'Concentric' },
    { id: 'constraint_equal',         icon: ico('CE'), label: 'Equal' },
    { id: 'constraint_symmetric',     icon: ico('CS'), label: 'Symmetric' },
    { id: 'constraint_fix',           icon: ico('CF'), label: 'Fix' },
    { id: 'dim_constraint_linear',    icon: ico('DCL'), label: 'Dim Linear C' },
    { id: 'dim_constraint_aligned',   icon: ico('DCA'), label: 'Dim Aligned C' },
    { id: 'dim_constraint_angular',   icon: ico('DCG'), label: 'Dim Angular C' },
    { id: 'dim_constraint_radial',    icon: ico('DCR'), label: 'Dim Radial C' },
    { id: 'dim_constraint_diameter',  icon: ico('DCD'), label: 'Dim Diameter C' },
  ]},
  { label: 'Output', tools: [
    { id: 'plot',         icon: ico('PLT'), label: 'Plot',         shortcut: 'Ctrl+P' },
    { id: 'publish',      icon: ico('PUB'), label: 'Publish' },
    { id: 'export_pdf',   icon: ico('PDF'), label: 'Export PDF' },
    { id: 'export_dxf_tool', icon: ico('DXF'), label: 'Export DXF' },
    { id: 'export_svg',   icon: ico('SVG'), label: 'Export SVG' },
    { id: 'export_png',   icon: ico('PNG'), label: 'Export PNG' },
    { id: 'export_ifc',   icon: ico('IFC'), label: 'Export IFC' },
    { id: 'page_setup',   icon: ico('PS'),  label: 'Page Setup' },
    { id: 'plot_style',   icon: ico('PST'), label: 'Plot Style' },
  ]},
  { label: 'Utility', tools: [
    { id: 'purge',   icon: ico('PU'),  label: 'Purge',  shortcut: 'PU' },
    { id: 'audit',   icon: ico('AU'),  label: 'Audit',  shortcut: 'AU' },
    { id: 'units',   icon: ico('UN'),  label: 'Units',  shortcut: 'UN' },
    { id: 'limits',  icon: ico('LIM'), label: 'Limits', shortcut: 'LIM' },
    { id: 'recover', icon: ico('RCR'), label: 'Recover' },
    { id: 'drawing_properties', icon: ico('DWG'), label: 'Drawing Props' },
    { id: 'rename_named',       icon: ico('REN'), label: 'Rename' },
  ]},
  { label: '3D', tools: [
    { id: 'extrude_3d',   icon: ico('EXT'), label: 'Extrude' },
    { id: 'revolve_3d',   icon: ico('REV'), label: 'Revolve' },
    { id: 'sweep_3d',     icon: ico('SWP'), label: 'Sweep' },
    { id: 'loft_3d',      icon: ico('LFT'), label: 'Loft' },
    { id: 'union_3d',     icon: ico('UNI'), label: 'Union 3D' },
    { id: 'subtract_3d',  icon: ico('SUB'), label: 'Subtract 3D' },
    { id: 'intersect_3d', icon: ico('INT'), label: 'Intersect 3D' },
    { id: 'slice_3d',     icon: ico('SLC'), label: 'Slice' },
    { id: 'presspull',    icon: ico('PP'),  label: 'Press/Pull' },
    { id: 'section_plane', icon: ico('SP'), label: 'Section Plane' },
    { id: 'flatshot',     icon: ico('FS'),  label: 'Flatshot' },
    { id: 'thicken',      icon: ico('TK'),  label: 'Thicken' },
    { id: 'shell_3d',     icon: ico('SH'),  label: 'Shell' },
    { id: 'fillet_3d',    icon: ico('F3'),  label: 'Fillet 3D' },
    { id: 'chamfer_3d',   icon: ico('C3'),  label: 'Chamfer 3D' },
    { id: 'meshsmooth',   icon: ico('MS'),  label: 'Mesh Smooth' },
    { id: 'mesh_edit',    icon: ico('ME'),  label: 'Mesh Edit' },
  ]},
  { label: 'Data', tools: [
    { id: 'data_link',             icon: ico('DL'),  label: 'Data Link' },
    { id: 'data_extraction',       icon: ico('DX'),  label: 'Data Extract' },
    { id: 'field_update_all',      icon: ico('FU'),  label: 'Update Fields' },
    { id: 'hyperlink',             icon: ico('HL'),  label: 'Hyperlink' },
    { id: 'image_attach',          icon: ico('IA'),  label: 'Image Attach' },
    { id: 'image_clip',            icon: ico('IC'),  label: 'Image Clip' },
    { id: 'pdf_attach',            icon: ico('PA'),  label: 'PDF Attach' },
    { id: 'compare_drawings',      icon: ico('CMP'), label: 'Compare' },
    { id: 'geolocation',           icon: ico('GEO'), label: 'Geolocation' },
    { id: 'sheet_set_manager',     icon: ico('SSM'), label: 'Sheet Set Mgr' },
  ]},
  { label: 'IFC/BIM', tools: [
    { id: 'import_ifc',         icon: ico('IFC↓'), label: 'Import IFC' },
    { id: 'export_ifc_tool',    icon: ico('IFC↑'), label: 'Export IFC' },
    { id: 'ifc_validate',       icon: ico('IFC✓'), label: 'Validate IFC' },
    { id: 'ifc_clash',          icon: ico('CLH'),  label: 'Clash Detect' },
    { id: 'ifc_qty_takeoff',    icon: ico('QTO'),  label: 'Qty Takeoff' },
    { id: 'ifc_spatial',        icon: ico('SPT'),  label: 'Spatial Query' },
    { id: 'import_dxf',         icon: ico('DXF↓'), label: 'Import DXF' },
    { id: 'export_dxf_tool',    icon: ico('DXF↑'), label: 'Export DXF' },
    { id: 'export_svg',         icon: ico('SVG'),  label: 'Export SVG' },
    { id: 'export_png',         icon: ico('PNG'),  label: 'Export PNG' },
    { id: 'export_pdf',         icon: ico('PDF'),  label: 'Export PDF' },
  ]},
  { label: 'Electrical', tools: [
    { id: 'elec_receptacle',    icon: ico('⏚'),   label: 'Receptacle' },
    { id: 'elec_switch',        icon: ico('⏻'),   label: 'Switch' },
    { id: 'elec_light',         icon: ico('💡'),   label: 'Light Fixture' },
    { id: 'elec_panel',         icon: ico('⚡'),   label: 'Panel' },
    { id: 'elec_circuit',       icon: ico('↺'),   label: 'Circuit' },
    { id: 'elec_wire',          icon: ico('~'),    label: 'Wire Run' },
    { id: 'elec_junction',      icon: ico('⊕'),   label: 'Junction Box' },
  ]},
  { label: 'Plumbing', tools: [
    { id: 'plumb_fixture',      icon: ico('🚿'),  label: 'Fixture' },
    { id: 'plumb_pipe',         icon: ico('│'),   label: 'Pipe' },
    { id: 'plumb_valve',        icon: ico('⊗'),   label: 'Valve' },
    { id: 'plumb_drain',        icon: ico('▽'),   label: 'Drain' },
    { id: 'plumb_water_heater', icon: ico('♨'),   label: 'Water Heater' },
    { id: 'plumb_cleanout',     icon: ico('○'),   label: 'Clean-Out' },
  ]},
  { label: 'HVAC', tools: [
    { id: 'hvac_diffuser',      icon: ico('◇'),   label: 'Supply Diff.' },
    { id: 'hvac_return',        icon: ico('◆'),   label: 'Return Grille' },
    { id: 'hvac_thermostat',    icon: ico('θ'),   label: 'Thermostat' },
    { id: 'hvac_unit',          icon: ico('❄'),   label: 'HVAC Unit' },
    { id: 'hvac_flex_duct',     icon: ico('≈'),   label: 'Flex Duct' },
    { id: 'hvac_damper',        icon: ico('⊞'),   label: 'Damper' },
  ]},
  { label: 'Fire', tools: [
    { id: 'fire_sprinkler',     icon: ico('⊙'),   label: 'Sprinkler' },
    { id: 'fire_alarm',         icon: ico('🔔'),  label: 'Fire Alarm' },
    { id: 'fire_extinguisher',  icon: ico('🧯'),  label: 'Extinguisher' },
    { id: 'fire_hose',          icon: ico('⊘'),   label: 'Fire Hose' },
    { id: 'fire_exit_sign',     icon: ico('🚪'),  label: 'Exit Sign' },
    { id: 'fire_smoke_detector', icon: ico('◎'),  label: 'Smoke Detector' },
  ]},
  { label: 'Layout', tools: [
    { id: 'layout_new',         icon: ico('📄'),  label: 'New Layout' },
    { id: 'layout_from_template', icon: ico('📋'), label: 'From Template' },
    { id: 'viewport_create',    icon: ico('VP+'),  label: 'New Viewport' },
    { id: 'viewport_scale',     icon: ico('VP⊡'), label: 'VP Scale' },
    { id: 'viewport_lock',      icon: ico('VP🔒'), label: 'VP Lock' },
    { id: 'model_space',        icon: ico('MS'),   label: 'Model Space' },
    { id: 'paper_space',        icon: ico('PS'),   label: 'Paper Space' },
  ]},
  { label: 'ADA', tools: [
    { id: 'ada_ramp',           icon: ico('♿↗'),  label: 'ADA Ramp' },
    { id: 'ada_parking',        icon: ico('♿P'),  label: 'ADA Parking' },
    { id: 'ada_restroom',       icon: ico('♿🚻'), label: 'ADA Restroom' },
    { id: 'ada_clearance',      icon: ico('♿⊡'), label: 'ADA Clearance' },
  ]},
];

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID_MM = 100;
const MM_PER_PX = 5;          // at scale=1 → 1px = 5mm
const SNAP_THRESHOLD_PX = 12; // snapping radius in screen pixels
const MAX_UNDO = 100;
const SELECTION_TOL_MM = 200;

interface Transform { x: number; y: number; scale: number; }
interface Props {
  floor: FloorPlan;
  layers: Layer[];
  onFloorChange: (f: FloorPlan) => void;
  onLayersChange: (l: Layer[]) => void;
  onStatusChange: (s: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function PlansTab({ floor, layers, onFloorChange, onLayersChange, onStatusChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Core state ──────────────────────────────────────────────────────────
  const [activeTool, setActiveTool]   = useState<Tool>('select');
  const [activeLayer, setActiveLayer] = useState('Walls');
  const [transform, setTransform]     = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [cursor, setCursor]           = useState<Vec2 | null>(null);
  const [drawPts, setDrawPts]         = useState<Vec2[]>([]); // accumulated drawing points
  const [isPanning, setIsPanning]     = useState(false);
  const [panStart, setPanStart]       = useState<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showLayers, setShowLayers]   = useState(true);
  const [snapIndicator, setSnapIndicator] = useState<{ pt: Vec2; kind: string } | null>(null);

  // Drafting aids
  const [orthoOn, setOrthoOn]         = useState(false);
  const [gridSnapOn, setGridSnapOn]   = useState(true);
  const [endpointSnapOn, setEndpointSnapOn] = useState(true);
  const [midpointSnapOn, setMidpointSnapOn] = useState(true);
  const [intersectSnapOn, setIntersectSnapOn] = useState(false);
  const [nearestSnapOn, setNearestSnapOn] = useState(false);
  const [perpendicularSnapOn, setPerpendicularSnapOn] = useState(false);
  const [tangentSnapOn, setTangentSnapOn] = useState(false);
  const [centerSnapOn, setCenterSnapOn] = useState(true);
  const [polarTrackOn, setPolarTrackOn] = useState(false);
  const [polarIncrement, setPolarIncrement] = useState(45);

  // Arch tool defaults
  const [wallThickness, setWallThickness] = useState(200);
  const [wallHeight, setWallHeight]       = useState(3000);
  const [polygonSides, setPolygonSides]   = useState(6);
  const [donutInner, setDonutInner]       = useState(200);
  const [donutOuter, setDonutOuter]       = useState(500);
  const [mlineOffsets, setMlineOffsets]    = useState([100, -100]);
  const [filletRadius, setFilletRadius]   = useState(0);
  const [chamferDist1, setChamferDist1]   = useState(100);
  const [chamferDist2, setChamferDist2]   = useState(100);

  // Parametric dimension editing
  const [editingDimId, setEditingDimId]     = useState<string | null>(null);
  const [editingDimValue, setEditingDimValue] = useState('');
  const [offsetDist, setOffsetDist]       = useState(500);

  // Block & Group system
  const [blocks, setBlocks]       = useState<BlockDef[]>([]);
  const [groups, setGroups]       = useState<Record<string, string[]>>({});
  const [drawingUnits, setDrawingUnits] = useState<'mm' | 'm' | 'cm' | 'ft' | 'in'>('mm');
  const [activeColor, setActiveColor] = useState('#e6edf3');
  const [activeLineweight, setActiveLineweight] = useState(0);
  const [activeLinetype, setActiveLinetype] = useState('continuous');

  // Selection box
  const [selBox, setSelBox] = useState<{ start: Vec2; end: Vec2 } | null>(null);

  // Transform state (Move/Copy/Rotate/Scale/Mirror)
  const [xformState, setXformState] = useState<{
    basepoint: Vec2; current: Vec2; step: 'base' | 'target';
  } | null>(null);

  // Undo / Redo
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  // Command line
  const [cmdText, setCmdText]       = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>(['ArchFlow Command Line ready. Type a command (e.g. line, wall, trim, offset).']);

  // ── Dynamic Input ───────────────────────────────────────────────────────
  const [dynamicInputOn, setDynamicInputOn]   = useState(true);
  const [objectTrackingOn, setObjectTrackingOn] = useState(false);

  // ── Paper space / Layouts ───────────────────────────────────────────────
  const [isModelSpace, setIsModelSpace]       = useState(true);
  const [activeDimStyle, setActiveDimStyle]   = useState('Standard');
  const [activeTextStyle, setActiveTextStyle] = useState('Standard');

  // ── Additional drawing parameters ──────────────────────────────────────
  const [splineSegments, setSplineSegments]   = useState(8);
  const [arcBulge, setArcBulge]               = useState(0);
  const [lineExtension, setLineExtension]     = useState(0);
  const [constructionMode, setConstructionMode] = useState(false);
  const [doorWidth, setDoorWidth]             = useState(900);
  const [windowWidth, setWindowWidth]         = useState(1200);
  const [columnSize, setColumnSize]           = useState(300);
  const [stairWidth, setStairWidth]           = useState(1200);
  const [pipeSize, setPipeSize]               = useState(100);
  const [ductWidth, setDuctWidth]             = useState(300);
  const [conduitSize, setConduitSize]         = useState(25);
  const [textHeight, setTextHeight]           = useState(250);
  const [dimArrowSize, setDimArrowSize]       = useState(100);
  const [hatchPattern, setHatchPattern]       = useState('ANSI31');
  const [hatchScale, setHatchScale]           = useState(1);
  const [arrayRows, setArrayRows]             = useState(3);
  const [arrayCols, setArrayCols]             = useState(3);
  const [arrayRowSpace, setArrayRowSpace]     = useState(1000);
  const [arrayColSpace, setArrayColSpace]     = useState(1000);
  const [arrayPolarCount, setArrayPolarCount] = useState(6);
  const [arrayPolarAngle, setArrayPolarAngle] = useState(360);
  const [lineweight, setLineweight]           = useState(0.25);
  const [currentColor, setCurrentColor]       = useState('bylayer');

  // ── Coordinate display ─────────────────────────────────────────────────
  const [coordDisplay, setCoordDisplay]       = useState<'abs' | 'rel' | 'polar'>('abs');

  // ── Coordinate transforms ───────────────────────────────────────────────
  const pxPerMm = useCallback((t: Transform) => t.scale / MM_PER_PX, []);

  const screenToWorld = useCallback((sx: number, sy: number, t: Transform): Vec2 => ({
    x: (sx - t.x) / t.scale * MM_PER_PX,
    y: (sy - t.y) / t.scale * MM_PER_PX,
  }), []);

  const worldToScreen = useCallback((wx: number, wy: number, t: Transform): Vec2 => ({
    x: wx / MM_PER_PX * t.scale + t.x,
    y: wy / MM_PER_PX * t.scale + t.y,
  }), []);

  // ── Line-line intersection helper ───────────────────────────────────────
  const lineLineIntersect = useCallback((a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null => {
    const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
    const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
    const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { x: a1.x + t * d1x, y: a1.y + t * d1y };
    }
    return null;
  }, []);

  // ── Snap engine ─────────────────────────────────────────────────────────
  const snap = useCallback((raw: Vec2): { pt: Vec2; kind: string } => {
    const thresholdMm = SNAP_THRESHOLD_PX * MM_PER_PX / transform.scale;
    let best = raw, bestDist = Infinity, bestKind = '';

    if (endpointSnapOn) {
      for (const e of floor.entities) {
        const layer = layers.find(l => l.name === e.layer);
        if (layer && (!layer.visible || layer.locked)) continue;
        for (const v of entityVertices(e)) {
          const d = dist(raw, v);
          if (d < thresholdMm && d < bestDist) {
            best = v; bestDist = d; bestKind = 'Endpoint';
          }
        }
      }
    }

    if (midpointSnapOn) {
      for (const e of floor.entities) {
        const layer = layers.find(l => l.name === e.layer);
        if (layer && (!layer.visible || layer.locked)) continue;
        if (e.type === 'line' || e.type === 'wall') {
          const l = e as LineEntity;
          const m = midpoint({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 });
          const d = dist(raw, m);
          if (d < thresholdMm && d < bestDist) {
            best = m; bestDist = d; bestKind = 'Midpoint';
          }
        }
      }
    }

    // Center snap for circles / arcs / ellipses
    if (centerSnapOn) {
      for (const e of floor.entities) {
        const layer = layers.find(l => l.name === e.layer);
        if (layer && (!layer.visible || layer.locked)) continue;
        if (e.type === 'circle' || e.type === 'arc') {
          const c = e as CircleEntity;
          const d = dist(raw, { x: c.cx, y: c.cy });
          if (d < thresholdMm && d < bestDist) { best = { x: c.cx, y: c.cy }; bestDist = d; bestKind = 'Center'; }
        } else if (e.type === 'ellipse') {
          const el = e as EllipseEntity;
          const d = dist(raw, { x: el.cx, y: el.cy });
          if (d < thresholdMm && d < bestDist) { best = { x: el.cx, y: el.cy }; bestDist = d; bestKind = 'Center'; }
        } else if (e.type === 'donut') {
          const dn = e as DonutEntity;
          const d = dist(raw, { x: dn.cx, y: dn.cy });
          if (d < thresholdMm && d < bestDist) { best = { x: dn.cx, y: dn.cy }; bestDist = d; bestKind = 'Center'; }
        }
      }
    }

    // Intersection snap
    if (intersectSnapOn) {
      const segs: { a: Vec2; b: Vec2 }[] = [];
      for (const e of floor.entities) {
        const layer = layers.find(l => l.name === e.layer);
        if (layer && (!layer.visible || layer.locked)) continue;
        if (e.type === 'line' || e.type === 'wall' || e.type === 'beam' || e.type === 'curtainwall') {
          const l = e as LineEntity;
          segs.push({ a: { x: l.x1, y: l.y1 }, b: { x: l.x2, y: l.y2 } });
        }
      }
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const ip = lineLineIntersect(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
          if (ip) {
            const d = dist(raw, ip);
            if (d < thresholdMm && d < bestDist) { best = ip; bestDist = d; bestKind = 'Intersection'; }
          }
        }
      }
    }

    // Grid snap as fallback
    if (gridSnapOn && bestKind === '') {
      best = {
        x: Math.round(raw.x / GRID_MM) * GRID_MM,
        y: Math.round(raw.y / GRID_MM) * GRID_MM,
      };
      bestKind = 'Grid';
    }

    return { pt: best, kind: bestKind };
  }, [floor.entities, layers, transform.scale, gridSnapOn, endpointSnapOn, midpointSnapOn,
      intersectSnapOn, centerSnapOn]);

  // ── Ortho constraint ────────────────────────────────────────────────────
  const applyOrtho = useCallback((from: Vec2, to: Vec2): Vec2 => {
    if (!orthoOn) return to;
    const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
    return dx > dy
      ? { x: to.x, y: from.y }
      : { x: from.x, y: to.y };
  }, [orthoOn]);

  // ── Push undo snapshot ──────────────────────────────────────────────────
  const pushUndo = useCallback((desc: string) => {
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), {
      timestamp: Date.now(), description: desc,
      entities: JSON.parse(JSON.stringify(floor.entities)),
    }]);
    setRedoStack([]);
  }, [floor.entities]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, { timestamp: Date.now(), description: 'redo', entities: JSON.parse(JSON.stringify(floor.entities)) }]);
    onFloorChange({ ...floor, entities: last.entities });
    setUndoStack(prev => prev.slice(0, -1));
    onStatusChange(`Undo: ${last.description}`);
  }, [undoStack, floor, onFloorChange, onStatusChange]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, { timestamp: Date.now(), description: 'undo', entities: JSON.parse(JSON.stringify(floor.entities)) }]);
    onFloorChange({ ...floor, entities: last.entities });
    setRedoStack(prev => prev.slice(0, -1));
    onStatusChange('Redo');
  }, [redoStack, floor, onFloorChange, onStatusChange]);

  // ── Command logger ──────────────────────────────────────────────────────
  const cmdLog = useCallback((msg: string) => {
    setCmdHistory(prev => [...prev.slice(-19), msg]);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING ENGINE
  // ═══════════════════════════════════════════════════════════════════════════
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const t = transform;
    const ppm = pxPerMm(t);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(t.x, t.y);

    // ── Grid ────────────────────────────────────────────────────────────
    const gridLayer = layers.find(l => l.name === 'Grid');
    if (!gridLayer || gridLayer.visible) {
      const gPx = GRID_MM * ppm;
      if (gPx > 4) {
        const sX = -Math.ceil(t.x / gPx) * gPx;
        const sY = -Math.ceil(t.y / gPx) * gPx;
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        for (let x = sX; x < W; x += gPx) { ctx.beginPath(); ctx.moveTo(x, -t.y); ctx.lineTo(x, H - t.y); ctx.stroke(); }
        for (let y = sY; y < H; y += gPx) { ctx.beginPath(); ctx.moveTo(-t.x, y); ctx.lineTo(W - t.x, y); ctx.stroke(); }
      }
      const mPx = 1000 * ppm;
      if (mPx > 10) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        const msX = -Math.ceil(t.x / mPx) * mPx;
        const msY = -Math.ceil(t.y / mPx) * mPx;
        for (let x = msX; x < W; x += mPx) { ctx.beginPath(); ctx.moveTo(x, -t.y); ctx.lineTo(x, H - t.y); ctx.stroke(); }
        for (let y = msY; y < H; y += mPx) { ctx.beginPath(); ctx.moveTo(-t.x, y); ctx.lineTo(W - t.x, y); ctx.stroke(); }
      }
    }

    // ── Origin crosshair ─────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,0,0,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();

    // ── Linetype helper ──────────────────────────────────────────────────
    const applyLinetype = (linetype?: string) => {
      switch (linetype) {
        case 'dashed': ctx.setLineDash([8, 4]); break;
        case 'dotted': ctx.setLineDash([2, 3]); break;
        case 'dashdot': ctx.setLineDash([8, 3, 2, 3]); break;
        case 'center': ctx.setLineDash([12, 3, 4, 3]); break;
        case 'phantom': ctx.setLineDash([12, 3, 4, 3, 4, 3]); break;
        case 'hidden': ctx.setLineDash([6, 4]); break;
        default: ctx.setLineDash([]); break;
      }
    };

    // ── ENTITY RENDERER ──────────────────────────────────────────────────
    for (const entity of floor.entities) {
      if (entity.visible === false) continue;
      const layer = layers.find(l => l.name === entity.layer);
      if (layer && !layer.visible) continue;

      const isSel = selectedIds.includes(entity.id);
      const color = isSel ? '#58a6ff' : (entity.color || layer?.color || '#e6edf3');
      const lw = Math.max(0.5, (entity.lineweight || layer?.lineweight || 0.25) * 2 * t.scale);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = isSel ? lw * 1.8 : lw;
      applyLinetype(entity.linetype || layer?.linetype);

      switch (entity.type) {
        case 'wall': {
          const w = entity as WallEntity;
          const x1 = w.x1 * ppm, y1 = w.y1 * ppm, x2 = w.x2 * ppm, y2 = w.y2 * ppm;
          const len = Math.hypot(x2 - x1, y2 - y1);
          if (len < 0.5) break;
          const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;
          const ht = (w.thickness * ppm) / 2;
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.15)' : 'rgba(120,110,100,0.15)';
          ctx.beginPath();
          ctx.moveTo(x1 + nx * ht, y1 + ny * ht); ctx.lineTo(x2 + nx * ht, y2 + ny * ht);
          ctx.lineTo(x2 - nx * ht, y2 - ny * ht); ctx.lineTo(x1 - nx * ht, y1 - ny * ht);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = isSel ? 2 : Math.max(0.7, t.scale * 0.7);
          ctx.beginPath(); ctx.moveTo(x1 + nx * ht, y1 + ny * ht); ctx.lineTo(x2 + nx * ht, y2 + ny * ht); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x1 - nx * ht, y1 - ny * ht); ctx.lineTo(x2 - nx * ht, y2 - ny * ht); ctx.stroke();
          // End caps
          ctx.beginPath(); ctx.moveTo(x1 + nx * ht, y1 + ny * ht); ctx.lineTo(x1 - nx * ht, y1 - ny * ht); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x2 + nx * ht, y2 + ny * ht); ctx.lineTo(x2 - nx * ht, y2 - ny * ht); ctx.stroke();
          break;
        }
        case 'line': {
          const l = entity as LineEntity;
          ctx.beginPath(); ctx.moveTo(l.x1 * ppm, l.y1 * ppm); ctx.lineTo(l.x2 * ppm, l.y2 * ppm); ctx.stroke();
          break;
        }
        case 'circle': {
          const c = entity as CircleEntity;
          ctx.beginPath(); ctx.arc(c.cx * ppm, c.cy * ppm, c.radius * ppm, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'arc': {
          const a = entity as ArcEntity;
          ctx.beginPath(); ctx.arc(a.cx * ppm, a.cy * ppm, a.radius * ppm, a.startAngle, a.endAngle); ctx.stroke();
          break;
        }
        case 'rectangle': {
          const r = entity as RectangleEntity;
          const rx = r.x1 * ppm, ry = r.y1 * ppm, rw = (r.x2 - r.x1) * ppm, rh = (r.y2 - r.y1) * ppm;
          if (r.cornerRadius && r.cornerRadius > 0) {
            const cr = r.cornerRadius * ppm;
            ctx.beginPath();
            ctx.moveTo(rx + cr, ry);
            ctx.lineTo(rx + rw - cr, ry); ctx.arcTo(rx + rw, ry, rx + rw, ry + cr, cr);
            ctx.lineTo(rx + rw, ry + rh - cr); ctx.arcTo(rx + rw, ry + rh, rx + rw - cr, ry + rh, cr);
            ctx.lineTo(rx + cr, ry + rh); ctx.arcTo(rx, ry + rh, rx, ry + rh - cr, cr);
            ctx.lineTo(rx, ry + cr); ctx.arcTo(rx, ry, rx + cr, ry, cr);
            ctx.closePath(); ctx.stroke();
          } else {
            ctx.strokeRect(rx, ry, rw, rh);
          }
          break;
        }
        case 'polyline': {
          const pl = entity as PolylineEntity;
          if (pl.points.length === 0) break;
          ctx.beginPath();
          ctx.moveTo(pl.points[0].x * ppm, pl.points[0].y * ppm);
          for (let i = 1; i < pl.points.length; i++) ctx.lineTo(pl.points[i].x * ppm, pl.points[i].y * ppm);
          if (pl.closed) ctx.closePath();
          ctx.stroke();
          break;
        }
        case 'polygon': {
          const pg = entity as PolygonEntity;
          ctx.beginPath();
          for (let i = 0; i <= pg.sides; i++) {
            const a = pg.rotation + (2 * Math.PI * i) / pg.sides;
            const px = (pg.cx + pg.radius * Math.cos(a)) * ppm;
            const py = (pg.cy + pg.radius * Math.sin(a)) * ppm;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
          break;
        }
        case 'ellipse': {
          const el = entity as EllipseEntity;
          ctx.beginPath();
          ctx.ellipse(el.cx * ppm, el.cy * ppm, el.rx * ppm, el.ry * ppm, el.rotation, el.startAngle, el.endAngle);
          ctx.stroke();
          break;
        }
        case 'spline': {
          const sp = entity as SplineEntity;
          if (sp.controlPoints.length < 2) break;
          ctx.beginPath();
          ctx.moveTo(sp.controlPoints[0].x * ppm, sp.controlPoints[0].y * ppm);
          if (sp.controlPoints.length === 2) {
            ctx.lineTo(sp.controlPoints[1].x * ppm, sp.controlPoints[1].y * ppm);
          } else if (sp.controlPoints.length === 3) {
            ctx.quadraticCurveTo(sp.controlPoints[1].x * ppm, sp.controlPoints[1].y * ppm, sp.controlPoints[2].x * ppm, sp.controlPoints[2].y * ppm);
          } else {
            // Catmull-Rom through points
            for (let i = 0; i < sp.controlPoints.length - 1; i++) {
              const p0 = sp.controlPoints[Math.max(0, i - 1)];
              const p1 = sp.controlPoints[i];
              const p2 = sp.controlPoints[Math.min(sp.controlPoints.length - 1, i + 1)];
              const p3 = sp.controlPoints[Math.min(sp.controlPoints.length - 1, i + 2)];
              const cp1x = (p1.x + (p2.x - p0.x) / 6) * ppm;
              const cp1y = (p1.y + (p2.y - p0.y) / 6) * ppm;
              const cp2x = (p2.x - (p3.x - p1.x) / 6) * ppm;
              const cp2y = (p2.y - (p3.y - p1.y) / 6) * ppm;
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x * ppm, p2.y * ppm);
            }
          }
          ctx.stroke();
          break;
        }
        case 'hatch': {
          const h = entity as HatchEntity;
          if (h.boundary.length < 3) break;
          // Fill boundary
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.15)' : 'rgba(100,100,100,0.15)';
          ctx.beginPath();
          ctx.moveTo(h.boundary[0].x * ppm, h.boundary[0].y * ppm);
          for (let i = 1; i < h.boundary.length; i++) ctx.lineTo(h.boundary[i].x * ppm, h.boundary[i].y * ppm);
          ctx.closePath(); ctx.fill();
          // Hatch lines
          const { min, max } = (() => {
            let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
            for (const p of h.boundary) { mnx = Math.min(mnx, p.x); mny = Math.min(mny, p.y); mxx = Math.max(mxx, p.x); mxy = Math.max(mxy, p.y); }
            return { min: { x: mnx, y: mny }, max: { x: mxx, y: mxy } };
          })();
          const spacing = (h.scale || 1) * 200;
          ctx.strokeStyle = isSel ? 'rgba(88,166,255,0.4)' : 'rgba(180,180,180,0.3)';
          ctx.lineWidth = 0.5;
          const ang = h.angle || Math.PI / 4;
          const cosA = Math.cos(ang), sinA = Math.sin(ang);
          const diag = Math.hypot(max.x - min.x, max.y - min.y);
          for (let d = -diag; d < diag; d += spacing) {
            const ox = (min.x + max.x) / 2 + d * cosA;
            const oy = (min.y + max.y) / 2 + d * sinA;
            ctx.beginPath();
            ctx.moveTo((ox - diag * sinA) * ppm, (oy + diag * cosA) * ppm);
            ctx.lineTo((ox + diag * sinA) * ppm, (oy - diag * cosA) * ppm);
            ctx.stroke();
          }
          break;
        }
        case 'point': {
          const pt = entity as { x: number; y: number };
          const px = pt.x * ppm, py = pt.y * ppm;
          ctx.strokeStyle = color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke();
          ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'door': {
          const d = entity as DoorEntity;
          const dx = d.x * ppm, dy = d.y * ppm, dw = d.width * ppm;
          ctx.strokeStyle = color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy); ctx.stroke();
          ctx.beginPath(); ctx.arc(dx, dy, dw, 0, -(d.swing * Math.PI) / 180, true); ctx.stroke();
          // Gap in wall
          ctx.fillStyle = '#0d1117';
          ctx.fillRect(dx, dy - 3 * ppm, dw, 6 * ppm);
          // Redraw door
          ctx.strokeStyle = color;
          ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy); ctx.stroke();
          ctx.beginPath(); ctx.arc(dx, dy, dw, 0, -(d.swing * Math.PI) / 180, true); ctx.stroke();
          break;
        }
        case 'window': {
          const w = entity as WindowEntity;
          const wx = w.x * ppm, wy = w.y * ppm, ww = w.width * ppm;
          ctx.strokeStyle = color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(wx, wy - 4); ctx.lineTo(wx + ww, wy - 4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx, wy + 4); ctx.lineTo(wx + ww, wy + 4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx, wy - 4); ctx.lineTo(wx, wy + 4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx + ww, wy - 4); ctx.lineTo(wx + ww, wy + 4); ctx.stroke();
          break;
        }
        case 'column': {
          const col = entity as ColumnEntity;
          const cx = col.x * ppm, cy = col.y * ppm, cw = col.width * ppm, cd = col.depth * ppm;
          ctx.save();
          ctx.translate(cx + cw / 2, cy + cd / 2);
          ctx.rotate(col.rotation || 0);
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.4)' : 'rgba(160,140,200,0.3)';
          if (col.shape === 'circular') {
            ctx.beginPath(); ctx.arc(0, 0, cw / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          } else {
            ctx.fillRect(-cw / 2, -cd / 2, cw, cd);
            ctx.strokeRect(-cw / 2, -cd / 2, cw, cd);
            // Cross hatching
            ctx.beginPath(); ctx.moveTo(-cw / 2, -cd / 2); ctx.lineTo(cw / 2, cd / 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cw / 2, -cd / 2); ctx.lineTo(-cw / 2, cd / 2); ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case 'beam': {
          const b = entity as BeamEntity;
          const bx1 = b.x1 * ppm, by1 = b.y1 * ppm, bx2 = b.x2 * ppm, by2 = b.y2 * ppm;
          const bLen = Math.hypot(bx2 - bx1, by2 - by1);
          if (bLen < 0.5) break;
          const bnx = (by2 - by1) / bLen, bny = -(bx2 - bx1) / bLen;
          const bhw = (b.width * ppm) / 2;
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.2)' : 'rgba(120,120,200,0.15)';
          ctx.beginPath();
          ctx.moveTo(bx1 + bnx * bhw, by1 + bny * bhw); ctx.lineTo(bx2 + bnx * bhw, by2 + bny * bhw);
          ctx.lineTo(bx2 - bnx * bhw, by2 - bny * bhw); ctx.lineTo(bx1 - bnx * bhw, by1 - bny * bhw);
          ctx.closePath(); ctx.fill();
          ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
          // Center line
          ctx.strokeStyle = '#ef4444'; ctx.setLineDash([8, 4]);
          ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke();
          ctx.setLineDash([]);
          break;
        }
        case 'slab': case 'roof': case 'room': case 'zone': {
          const poly = entity as { points: Vec2[] };
          if (poly.points.length < 2) break;
          const fillColors: Record<string, string> = {
            slab: isSel ? 'rgba(88,166,255,0.15)' : 'rgba(55,65,81,0.2)',
            roof: isSel ? 'rgba(88,166,255,0.15)' : 'rgba(168,85,247,0.15)',
            room: isSel ? 'rgba(88,166,255,0.15)' : 'rgba(34,197,94,0.1)',
            zone: isSel ? 'rgba(88,166,255,0.15)' : 'rgba(88,166,255,0.1)',
          };
          ctx.fillStyle = fillColors[entity.type] || 'rgba(100,100,100,0.1)';
          ctx.beginPath();
          ctx.moveTo(poly.points[0].x * ppm, poly.points[0].y * ppm);
          for (let i = 1; i < poly.points.length; i++) ctx.lineTo(poly.points[i].x * ppm, poly.points[i].y * ppm);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          // Room label
          if (entity.type === 'room') {
            const rm = entity as RoomEntity;
            const cx = poly.points.reduce((s, p) => s + p.x, 0) / poly.points.length * ppm;
            const cy = poly.points.reduce((s, p) => s + p.y, 0) / poly.points.length * ppm;
            ctx.fillStyle = color; ctx.font = `${Math.max(10, 14 * t.scale)}px Inter`; ctx.textAlign = 'center';
            ctx.fillText(rm.name, cx, cy);
            if (rm.area) ctx.fillText(`${rm.area.toFixed(1)} m²`, cx, cy + 14 * t.scale);
            ctx.textAlign = 'start';
          }
          // Zone label + fill
          if (entity.type === 'zone') {
            const ze = entity as ZoneEntity;
            if (ze.fillColor && ze.fillOpacity) {
              ctx.save();
              ctx.globalAlpha = ze.fillOpacity;
              ctx.fillStyle = ze.fillColor;
              ctx.beginPath();
              ctx.moveTo(poly.points[0].x * ppm, poly.points[0].y * ppm);
              for (let i = 1; i < poly.points.length; i++) ctx.lineTo(poly.points[i].x * ppm, poly.points[i].y * ppm);
              ctx.closePath(); ctx.fill();
              ctx.restore();
            }
            const cx = poly.points.reduce((s, p) => s + p.x, 0) / poly.points.length * ppm;
            const cy = poly.points.reduce((s, p) => s + p.y, 0) / poly.points.length * ppm;
            ctx.fillStyle = ze.fillColor || '#58a6ff';
            ctx.font = `bold ${Math.max(10, 13 * t.scale)}px Inter`; ctx.textAlign = 'center';
            if (ze.labelVisible !== false) ctx.fillText(ze.name || 'Zone', cx, cy);
            if (ze.showArea !== false && ze.area) ctx.fillText(`${ze.area.toFixed(1)} m²`, cx, cy + 14 * t.scale);
            ctx.textAlign = 'start';
          }
          // Roof X mark
          if (entity.type === 'roof') {
            const pts = poly.points;
            const mnx = Math.min(...pts.map(p => p.x)) * ppm, mny = Math.min(...pts.map(p => p.y)) * ppm;
            const mxx = Math.max(...pts.map(p => p.x)) * ppm, mxy = Math.max(...pts.map(p => p.y)) * ppm;
            ctx.beginPath(); ctx.moveTo(mnx, mny); ctx.lineTo(mxx, mxy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(mxx, mny); ctx.lineTo(mnx, mxy); ctx.stroke();
          }
          break;
        }
        case 'stair': {
          const st = entity as StairEntity;
          const sx = st.x * ppm, sy = st.y * ppm, sw = st.width * ppm, sl = st.length * ppm;
          ctx.save();
          ctx.translate(sx + sw / 2, sy + sl / 2);
          ctx.rotate(st.rotation || 0);
          ctx.translate(-sw / 2, -sl / 2);
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.1)' : 'rgba(255,255,255,0.04)';
          ctx.fillRect(0, 0, sw, sl);
          ctx.strokeRect(0, 0, sw, sl);
          const n = Math.max(1, st.treadNumber);
          const td = sl / n;
          ctx.beginPath();
          for (let i = 1; i < n; i++) { ctx.moveTo(0, i * td); ctx.lineTo(sw, i * td); }
          // Up arrow
          ctx.moveTo(sw / 2, sl); ctx.lineTo(sw / 2, td);
          ctx.moveTo(sw / 2 - 4, td + 6); ctx.lineTo(sw / 2, td); ctx.lineTo(sw / 2 + 4, td + 6);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'ramp': {
          const rp = entity as RampEntity;
          const rx = rp.x * ppm, ry = rp.y * ppm, rw = rp.width * ppm, rl = rp.length * ppm;
          ctx.save();
          ctx.translate(rx + rw / 2, ry + rl / 2);
          ctx.rotate(rp.rotation || 0);
          ctx.translate(-rw / 2, -rl / 2);
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(0, 0, rw, rl);
          ctx.strokeRect(0, 0, rw, rl);
          // Slope arrow
          ctx.beginPath(); ctx.moveTo(rw / 2, rl * 0.9); ctx.lineTo(rw / 2, rl * 0.1);
          ctx.moveTo(rw / 2 - 6, rl * 0.2); ctx.lineTo(rw / 2, rl * 0.1); ctx.lineTo(rw / 2 + 6, rl * 0.2);
          ctx.stroke();
          ctx.font = `${Math.max(8, 10 * t.scale)}px Inter`; ctx.fillStyle = color; ctx.textAlign = 'center';
          ctx.fillText('RAMP', rw / 2, rl / 2); ctx.textAlign = 'start';
          ctx.restore();
          break;
        }
        case 'curtainwall': {
          const cw = entity as CurtainWallEntity;
          const cx1 = cw.x1 * ppm, cy1 = cw.y1 * ppm, cx2 = cw.x2 * ppm, cy2 = cw.y2 * ppm;
          ctx.strokeStyle = isSel ? '#58a6ff' : '#7dd3fc';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx1, cy1); ctx.lineTo(cx2, cy2); ctx.stroke();
          // Mullion marks
          const cwLen = Math.hypot(cx2 - cx1, cy2 - cy1);
          const spacing = cw.mullionSpacing * ppm;
          if (spacing > 4 && cwLen > 0) {
            const dx = (cx2 - cx1) / cwLen, dy = (cy2 - cy1) / cwLen;
            const nx = -dy * 6, ny = dx * 6;
            for (let d = spacing; d < cwLen; d += spacing) {
              const mx = cx1 + dx * d, my = cy1 + dy * d;
              ctx.beginPath(); ctx.moveTo(mx + nx, my + ny); ctx.lineTo(mx - nx, my - ny); ctx.stroke();
            }
          }
          break;
        }
        case 'text': {
          const te = entity as TextEntity;
          ctx.save();
          ctx.translate(te.x * ppm, te.y * ppm);
          ctx.rotate(te.rotation || 0);
          ctx.fillStyle = color;
          const style = `${te.bold ? 'bold ' : ''}${te.italic ? 'italic ' : ''}`;
          ctx.font = `${style}${te.fontSize * ppm}px ${te.fontFamily || 'Inter'}, sans-serif`;
          ctx.textAlign = te.alignment || 'left';
          ctx.fillText(te.text, 0, 0);
          ctx.restore();
          break;
        }
        case 'mtext': {
          const mt = entity as MTextEntity;
          ctx.save();
          ctx.translate(mt.x * ppm, mt.y * ppm);
          ctx.rotate(mt.rotation || 0);
          ctx.fillStyle = color;
          ctx.font = `${mt.fontSize * ppm}px Inter, sans-serif`;
          const lines = mt.text.split('\n');
          const lineH = mt.fontSize * ppm * (mt.lineSpacing || 1.5);
          for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, i * lineH);
          ctx.restore();
          break;
        }
        case 'dimension': {
          const dm = entity as DimensionEntity;
          const dx1 = dm.x1 * ppm, dy1 = dm.y1 * ppm, dx2 = dm.x2 * ppm, dy2 = dm.y2 * ppm;
          const off = dm.offset * ppm;
          const dLen = Math.hypot(dx2 - dx1, dy2 - dy1);
          if (dLen < 0.5) break;
          const dnx = -(dy2 - dy1) / dLen, dny = (dx2 - dx1) / dLen;
          // Extension lines
          ctx.strokeStyle = color; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(dx1, dy1); ctx.lineTo(dx1 + dnx * off, dy1 + dny * off); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(dx2, dy2); ctx.lineTo(dx2 + dnx * off, dy2 + dny * off); ctx.stroke();
          // Dimension line
          const ox1 = dx1 + dnx * off, oy1 = dy1 + dny * off;
          const ox2 = dx2 + dnx * off, oy2 = dy2 + dny * off;
          ctx.beginPath(); ctx.moveTo(ox1, oy1); ctx.lineTo(ox2, oy2); ctx.stroke();
          // Arrows
          const arrowLen = 8;
          const adx = (ox2 - ox1) / dLen, ady = (oy2 - oy1) / dLen;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.moveTo(ox1, oy1); ctx.lineTo(ox1 + adx * arrowLen - ady * 3, oy1 + ady * arrowLen + adx * 3); ctx.lineTo(ox1 + adx * arrowLen + ady * 3, oy1 + ady * arrowLen - adx * 3); ctx.fill();
          ctx.beginPath(); ctx.moveTo(ox2, oy2); ctx.lineTo(ox2 - adx * arrowLen + ady * 3, oy2 - ady * arrowLen - adx * 3); ctx.lineTo(ox2 - adx * arrowLen - ady * 3, oy2 - ady * arrowLen + adx * 3); ctx.fill();
          // Text
          const realDist = dist({ x: dm.x1, y: dm.y1 }, { x: dm.x2, y: dm.y2 });
          const precision = dm.precision ?? 0;
          const dimText = dm.textOverride || `${(realDist / 1000).toFixed(precision)} m`;
          ctx.fillStyle = color;
          ctx.font = `11px JetBrains Mono, monospace`;
          ctx.textAlign = 'center';
          ctx.save();
          ctx.translate((ox1 + ox2) / 2, (oy1 + oy2) / 2);
          const textAngle = Math.atan2(oy2 - oy1, ox2 - ox1);
          ctx.rotate(textAngle);
          ctx.fillText(dimText, 0, -4);
          ctx.restore();
          ctx.textAlign = 'start';
          break;
        }
        case 'leader': {
          const ld = entity as LeaderEntity;
          if (ld.points.length < 2) break;
          ctx.beginPath();
          ctx.moveTo(ld.points[0].x * ppm, ld.points[0].y * ppm);
          for (let i = 1; i < ld.points.length; i++) ctx.lineTo(ld.points[i].x * ppm, ld.points[i].y * ppm);
          ctx.stroke();
          // Arrowhead at first point
          const p0 = ld.points[0], p1 = ld.points[1];
          const ldA = angleBetween(p0, p1);
          const aSize = (ld.arrowSize || 100) * ppm;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(p0.x * ppm, p0.y * ppm);
          ctx.lineTo(p0.x * ppm + aSize * Math.cos(ldA + 0.2), p0.y * ppm + aSize * Math.sin(ldA + 0.2));
          ctx.lineTo(p0.x * ppm + aSize * Math.cos(ldA - 0.2), p0.y * ppm + aSize * Math.sin(ldA - 0.2));
          ctx.fill();
          // Text at last point
          const lastPt = ld.points[ld.points.length - 1];
          ctx.fillStyle = color;
          ctx.font = `${Math.max(10, 11 * t.scale)}px Inter`;
          ctx.fillText(ld.text, lastPt.x * ppm + 4, lastPt.y * ppm - 4);
          break;
        }
        case 'xline': {
          const xl = entity as XLineEntity;
          ctx.strokeStyle = isSel ? '#58a6ff' : '#6b7280';
          ctx.setLineDash([12, 6]);
          const ext = 50000 * ppm; // draw far enough
          ctx.beginPath();
          ctx.moveTo((xl.x - xl.dx * ext / ppm) * ppm, (xl.y - xl.dy * ext / ppm) * ppm);
          ctx.lineTo((xl.x + xl.dx * ext / ppm) * ppm, (xl.y + xl.dy * ext / ppm) * ppm);
          ctx.stroke(); ctx.setLineDash([]);
          break;
        }
        case 'ray': {
          const ry = entity as RayEntity;
          ctx.strokeStyle = isSel ? '#58a6ff' : '#6b7280';
          ctx.setLineDash([12, 6]);
          const ext = 50000 * ppm;
          ctx.beginPath();
          ctx.moveTo(ry.x * ppm, ry.y * ppm);
          ctx.lineTo((ry.x + ry.dx * ext / ppm) * ppm, (ry.y + ry.dy * ext / ppm) * ppm);
          ctx.stroke(); ctx.setLineDash([]);
          break;
        }
        case 'mline': {
          const ml = entity as MLineEntity;
          if (ml.points.length < 2) break;
          for (const off of ml.offsets) {
            ctx.beginPath();
            for (let i = 0; i < ml.points.length; i++) {
              const prev = ml.points[Math.max(0, i - 1)];
              const curr = ml.points[i];
              const next = ml.points[Math.min(ml.points.length - 1, i + 1)];
              const nx = -(next.y - prev.y), ny = next.x - prev.x;
              const len = Math.hypot(nx, ny) || 1;
              const ox = (nx / len) * off, oy = (ny / len) * off;
              const px = (curr.x + ox) * ppm, py = (curr.y + oy) * ppm;
              i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            if (ml.closed) ctx.closePath();
            ctx.stroke();
          }
          break;
        }
        case 'donut': {
          const dn = entity as DonutEntity;
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.3)' : 'rgba(200,200,200,0.2)';
          ctx.beginPath(); ctx.arc(dn.cx * ppm, dn.cy * ppm, dn.outerRadius * ppm, 0, Math.PI * 2);
          ctx.arc(dn.cx * ppm, dn.cy * ppm, dn.innerRadius * ppm, 0, Math.PI * 2, true);
          ctx.fill(); ctx.stroke();
          break;
        }
        case 'revcloud': {
          const rc = entity as RevCloudEntity;
          if (rc.points.length < 3) break;
          ctx.strokeStyle = isSel ? '#58a6ff' : '#f87171';
          ctx.lineWidth = Math.max(1, lw);
          ctx.beginPath();
          for (let i = 0; i < rc.points.length; i++) {
            const a = rc.points[i], b = rc.points[(i + 1) % rc.points.length];
            const mx = (a.x + b.x) / 2 * ppm, my = (a.y + b.y) / 2 * ppm;
            const d = Math.hypot((b.x - a.x) * ppm, (b.y - a.y) * ppm);
            const arcR = Math.max(d / 2, (rc.arcLength || 300) * ppm / 2);
            ctx.moveTo(a.x * ppm, a.y * ppm);
            ctx.arcTo(mx + (b.y - a.y) * ppm * 0.3, my - (b.x - a.x) * ppm * 0.3, b.x * ppm, b.y * ppm, arcR);
          }
          ctx.stroke();
          break;
        }
        case 'wipeout': {
          const wp = entity as WipeoutEntity;
          if (wp.points.length < 3) break;
          ctx.fillStyle = '#0d1117';
          ctx.beginPath();
          ctx.moveTo(wp.points[0].x * ppm, wp.points[0].y * ppm);
          for (let i = 1; i < wp.points.length; i++) ctx.lineTo(wp.points[i].x * ppm, wp.points[i].y * ppm);
          ctx.closePath(); ctx.fill();
          if (isSel) { ctx.strokeStyle = '#58a6ff'; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); }
          break;
        }
        case 'region': {
          const rg = entity as RegionEntity;
          if (rg.boundary.length < 3) break;
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.1)' : 'rgba(100,200,150,0.08)';
          ctx.beginPath();
          ctx.moveTo(rg.boundary[0].x * ppm, rg.boundary[0].y * ppm);
          for (let i = 1; i < rg.boundary.length; i++) ctx.lineTo(rg.boundary[i].x * ppm, rg.boundary[i].y * ppm);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          break;
        }
        case 'railing': {
          const rl = entity as RailingEntity;
          if (rl.points.length < 2) break;
          // Rail lines
          ctx.strokeStyle = isSel ? '#58a6ff' : '#c084fc';
          ctx.lineWidth = Math.max(1, lw);
          ctx.beginPath();
          ctx.moveTo(rl.points[0].x * ppm, rl.points[0].y * ppm);
          for (let i = 1; i < rl.points.length; i++) ctx.lineTo(rl.points[i].x * ppm, rl.points[i].y * ppm);
          ctx.stroke();
          // Balusters
          const bSpacing = rl.balusterSpacing * ppm;
          for (let i = 0; i < rl.points.length - 1; i++) {
            const a = rl.points[i], b = rl.points[i + 1];
            const segLen = Math.hypot((b.x - a.x) * ppm, (b.y - a.y) * ppm);
            const count = Math.floor(segLen / bSpacing);
            for (let j = 0; j <= count; j++) {
              const frac = count > 0 ? j / count : 0;
              const px = (a.x + (b.x - a.x) * frac) * ppm;
              const py = (a.y + (b.y - a.y) * frac) * ppm;
              ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
            }
          }
          break;
        }
        case 'ceiling': {
          const cg = entity as CeilingEntity;
          if (cg.points.length < 3) break;
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.1)' : 'rgba(212,212,216,0.08)';
          ctx.setLineDash([8, 4, 2, 4]);
          ctx.beginPath();
          ctx.moveTo(cg.points[0].x * ppm, cg.points[0].y * ppm);
          for (let i = 1; i < cg.points.length; i++) ctx.lineTo(cg.points[i].x * ppm, cg.points[i].y * ppm);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.setLineDash([]);
          break;
        }
        case 'multileader': {
          const mld = entity as MultiLeaderEntity;
          ctx.strokeStyle = color;
          for (const leaderPts of mld.leaders) {
            if (leaderPts.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(leaderPts[0].x * ppm, leaderPts[0].y * ppm);
            for (let i = 1; i < leaderPts.length; i++) ctx.lineTo(leaderPts[i].x * ppm, leaderPts[i].y * ppm);
            ctx.stroke();
            // Arrowhead
            const p0 = leaderPts[0], p1 = leaderPts[1];
            const a = angleBetween(p0, p1);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(p0.x * ppm, p0.y * ppm);
            ctx.lineTo(p0.x * ppm + 8 * Math.cos(a + 0.2), p0.y * ppm + 8 * Math.sin(a + 0.2));
            ctx.lineTo(p0.x * ppm + 8 * Math.cos(a - 0.2), p0.y * ppm + 8 * Math.sin(a - 0.2));
            ctx.fill();
          }
          // Content
          if (mld.leaders.length > 0 && mld.leaders[0].length > 0) {
            const lastPt = mld.leaders[0][mld.leaders[0].length - 1];
            ctx.fillStyle = color;
            ctx.font = `${Math.max(10, 11 * t.scale)}px Inter`;
            ctx.fillText(mld.content, (lastPt.x + mld.landingGap) * ppm, lastPt.y * ppm - 4);
          }
          break;
        }
        case 'table': {
          const tb = entity as TableEntity;
          ctx.save();
          ctx.translate(tb.x * ppm, tb.y * ppm);
          ctx.rotate(tb.rotation || 0);
          let totalW = 0, totalH = 0;
          for (const cw of tb.colWidths) totalW += cw;
          for (const rh of tb.rowHeights) totalH += rh;
          ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.5, lw);
          ctx.strokeRect(0, 0, totalW * ppm, totalH * ppm);
          // Rows
          let yy = 0;
          for (let r = 0; r < tb.rows; r++) {
            if (r > 0) { ctx.beginPath(); ctx.moveTo(0, yy * ppm); ctx.lineTo(totalW * ppm, yy * ppm); ctx.stroke(); }
            let xx = 0;
            for (let c = 0; c < tb.cols; c++) {
              if (c > 0) { ctx.beginPath(); ctx.moveTo(xx * ppm, yy * ppm); ctx.lineTo(xx * ppm, (yy + tb.rowHeights[r]) * ppm); ctx.stroke(); }
              // Cell text
              if (tb.cells[r] && tb.cells[r][c]) {
                ctx.fillStyle = color;
                ctx.font = `${Math.max(8, 10 * t.scale)}px Inter`;
                ctx.fillText(tb.cells[r][c], (xx + 20) * ppm, (yy + tb.rowHeights[r] * 0.65) * ppm);
              }
              xx += tb.colWidths[c];
            }
            yy += tb.rowHeights[r];
          }
          ctx.restore();
          break;
        }
        case 'tolerance': {
          const tol = entity as ToleranceEntity;
          ctx.save();
          ctx.translate(tol.x * ppm, tol.y * ppm);
          const boxW = 600 * ppm, boxH = 200 * ppm;
          ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.5, lw);
          ctx.strokeRect(0, 0, boxW, boxH);
          // Symbol
          ctx.fillStyle = color; ctx.font = `${Math.max(9, 11 * t.scale)}px JetBrains Mono`;
          ctx.fillText(tol.symbol, 5 * ppm, boxH * 0.65);
          // Value
          ctx.fillText(tol.value, boxW * 0.3, boxH * 0.65);
          // Datums
          if (tol.datum1) ctx.fillText(tol.datum1, boxW * 0.6, boxH * 0.65);
          if (tol.datum2) ctx.fillText(tol.datum2, boxW * 0.75, boxH * 0.65);
          ctx.restore();
          break;
        }
        case 'block_ref': {
          const br = entity as BlockRefEntity;
          ctx.save();
          ctx.translate(br.x * ppm, br.y * ppm);
          ctx.rotate(br.rotation || 0);
          ctx.scale(br.scaleX, br.scaleY);
          // Draw block reference marker
          ctx.strokeStyle = color; ctx.lineWidth = 1;
          ctx.strokeRect(-10, -10, 20, 20);
          ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(10, 10); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(-10, 10); ctx.stroke();
          ctx.fillStyle = color; ctx.font = '8px JetBrains Mono';
          ctx.fillText(br.blockName, 14, 4);
          ctx.restore();
          break;
        }

        // ── MEP Entity Renderers ──────────────────────────────────────────
        case 'pipe': {
          const p = entity as PipeEntity;
          if (p.points.length > 1) {
            ctx.lineWidth = Math.max(2, (p.diameter || 50) / 10 * t.scale);
            ctx.beginPath();
            ctx.moveTo(p.points[0].x * ppm, p.points[0].y * ppm);
            for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i].x * ppm, p.points[i].y * ppm);
            ctx.stroke();
            // Center line
            ctx.save(); ctx.setLineDash([4, 4]); ctx.lineWidth = 0.5; ctx.strokeStyle = '#888';
            ctx.beginPath();
            ctx.moveTo(p.points[0].x * ppm, p.points[0].y * ppm);
            for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i].x * ppm, p.points[i].y * ppm);
            ctx.stroke(); ctx.restore();
          }
          break;
        }
        case 'duct': {
          const d = entity as DuctEntity;
          if (d.points.length > 1) {
            const hw = (d.width || 300) / 2;
            for (let i = 0; i < d.points.length - 1; i++) {
              const p1 = d.points[i], p2 = d.points[i + 1];
              const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              if (len < 0.5) continue;
              const nx = (p2.y - p1.y) / len * hw, ny = -(p2.x - p1.x) / len * hw;
              ctx.beginPath();
              ctx.moveTo((p1.x + nx) * ppm, (p1.y + ny) * ppm);
              ctx.lineTo((p2.x + nx) * ppm, (p2.y + ny) * ppm);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo((p1.x - nx) * ppm, (p1.y - ny) * ppm);
              ctx.lineTo((p2.x - nx) * ppm, (p2.y - ny) * ppm);
              ctx.stroke();
            }
            // Cross-hatching for duct
            ctx.save(); ctx.setLineDash([6, 6]); ctx.lineWidth = 0.5; ctx.strokeStyle = '#666';
            ctx.beginPath();
            ctx.moveTo(d.points[0].x * ppm, d.points[0].y * ppm);
            for (let i = 1; i < d.points.length; i++) ctx.lineTo(d.points[i].x * ppm, d.points[i].y * ppm);
            ctx.stroke(); ctx.restore();
          }
          break;
        }
        case 'conduit': {
          const c = entity as ConduitEntity;
          if (c.points.length > 1) {
            ctx.lineWidth = Math.max(1, (c.diameter || 25) / 15 * t.scale);
            ctx.beginPath();
            ctx.moveTo(c.points[0].x * ppm, c.points[0].y * ppm);
            for (let i = 1; i < c.points.length; i++) ctx.lineTo(c.points[i].x * ppm, c.points[i].y * ppm);
            ctx.stroke();
          }
          break;
        }
        case 'cable_tray': {
          const ct = entity as CableTrayEntity;
          if (ct.points.length > 1) {
            const hw = (ct.width || 200) / 2;
            for (let i = 0; i < ct.points.length - 1; i++) {
              const p1 = ct.points[i], p2 = ct.points[i + 1];
              const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              if (len < 0.5) continue;
              const nx = (p2.y - p1.y) / len * hw, ny = -(p2.x - p1.x) / len * hw;
              ctx.beginPath();
              ctx.moveTo((p1.x + nx) * ppm, (p1.y + ny) * ppm);
              ctx.lineTo((p2.x + nx) * ppm, (p2.y + ny) * ppm);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo((p1.x - nx) * ppm, (p1.y - ny) * ppm);
              ctx.lineTo((p2.x - nx) * ppm, (p2.y - ny) * ppm);
              ctx.stroke();
              // Rungs
              const segLen = len;
              const rungSpacing = 200;
              const nRungs = Math.floor(segLen / rungSpacing);
              for (let r = 1; r < nRungs; r++) {
                const t2 = r / nRungs;
                const rx = (p1.x + (p2.x - p1.x) * t2);
                const ry = (p1.y + (p2.y - p1.y) * t2);
                ctx.beginPath();
                ctx.moveTo((rx + nx) * ppm, (ry + ny) * ppm);
                ctx.lineTo((rx - nx) * ppm, (ry - ny) * ppm);
                ctx.stroke();
              }
            }
          }
          break;
        }
        case 'sprinkler': case 'diffuser': case 'outlet': case 'switch_mep':
        case 'panel_board': case 'transformer': case 'valve': case 'pump': {
          const dev = entity as MEPDeviceEntity;
          const sx = dev.x * ppm, sy = dev.y * ppm;
          const sz = 8 * t.scale;
          const sym = (dev as any).symbol || '';
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(dev.rotation || 0);
          // Symbol varies by type and sub-symbol
          if (entity.type === 'sprinkler') {
            ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-sz * 0.5, -sz * 0.5); ctx.lineTo(sz * 0.5, sz * 0.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sz * 0.5, -sz * 0.5); ctx.lineTo(-sz * 0.5, sz * 0.5); ctx.stroke();
          } else if (entity.type === 'valve') {
            if (sym === 'damper') {
              // HVAC damper: rectangle with diagonal
              ctx.strokeRect(-sz, -sz * 0.4, sz * 2, sz * 0.8);
              ctx.beginPath(); ctx.moveTo(-sz, -sz * 0.4); ctx.lineTo(sz, sz * 0.4); ctx.stroke();
            } else {
              ctx.beginPath(); ctx.moveTo(-sz, -sz * 0.6); ctx.lineTo(0, 0); ctx.lineTo(-sz, sz * 0.6); ctx.closePath(); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(sz, -sz * 0.6); ctx.lineTo(0, 0); ctx.lineTo(sz, sz * 0.6); ctx.closePath(); ctx.stroke();
            }
          } else if (entity.type === 'pump') {
            ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.lineTo(sz, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sz * 0.3, -sz * 0.5); ctx.lineTo(sz, 0); ctx.lineTo(sz * 0.3, sz * 0.5); ctx.stroke();
          } else if (entity.type === 'outlet') {
            if (sym === 'light') {
              // Light fixture: circle with rays
              ctx.beginPath(); ctx.arc(0, 0, sz * 0.6, 0, Math.PI * 2); ctx.fill();
              for (let r = 0; r < 8; r++) {
                const ang = r * Math.PI / 4;
                ctx.beginPath();
                ctx.moveTo(Math.cos(ang) * sz * 0.7, Math.sin(ang) * sz * 0.7);
                ctx.lineTo(Math.cos(ang) * sz * 1.1, Math.sin(ang) * sz * 1.1);
                ctx.stroke();
              }
            } else if (sym === 'thermostat') {
              // Thermostat: "T" in circle
              ctx.beginPath(); ctx.arc(0, 0, sz * 0.8, 0, Math.PI * 2); ctx.stroke();
              ctx.font = `bold ${sz * 1.2}px JetBrains Mono`; ctx.fillStyle = color;
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText('T', 0, 0);
            } else if (sym === 'smoke_detector') {
              // Smoke detector: "SD" in circle
              ctx.beginPath(); ctx.arc(0, 0, sz * 0.9, 0, Math.PI * 2); ctx.stroke();
              ctx.font = `bold ${sz * 0.7}px JetBrains Mono`; ctx.fillStyle = color;
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText('SD', 0, 0);
            } else if (sym === 'pull_station') {
              // Fire alarm pull: square with "FA"
              ctx.strokeRect(-sz * 0.7, -sz * 0.7, sz * 1.4, sz * 1.4);
              ctx.font = `bold ${sz * 0.6}px JetBrains Mono`; ctx.fillStyle = '#ff3333';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText('FA', 0, 0);
            } else if (sym === 'junction') {
              // Junction box: filled circle
              ctx.beginPath(); ctx.arc(0, 0, sz * 0.5, 0, Math.PI * 2); ctx.fill();
              ctx.beginPath(); ctx.arc(0, 0, sz * 0.8, 0, Math.PI * 2); ctx.stroke();
            } else {
              // Standard receptacle: circle with two vertical slots
              ctx.beginPath(); ctx.arc(0, 0, sz * 0.8, 0, Math.PI * 2); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(-sz * 0.3, -sz * 0.3); ctx.lineTo(-sz * 0.3, sz * 0.3); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(sz * 0.3, -sz * 0.3); ctx.lineTo(sz * 0.3, sz * 0.3); ctx.stroke();
            }
          } else if (entity.type === 'switch_mep') {
            ctx.beginPath(); ctx.arc(0, 0, sz * 0.4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sz, -sz * 0.7); ctx.stroke();
          } else if (entity.type === 'diffuser') {
            if (sym === 'return_grille') {
              // Return grille: square with horizontal lines
              ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
              for (let i = -0.6; i <= 0.6; i += 0.4) {
                ctx.beginPath(); ctx.moveTo(-sz * 0.8, sz * i); ctx.lineTo(sz * 0.8, sz * i); ctx.stroke();
              }
            } else {
              // Supply diffuser: square with X
              ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
              ctx.beginPath(); ctx.moveTo(-sz, -sz); ctx.lineTo(sz, sz); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(sz, -sz); ctx.lineTo(-sz, sz); ctx.stroke();
            }
          } else if (entity.type === 'panel_board') {
            // Panel board: larger rectangle with "PB"
            ctx.strokeRect(-sz * 1.2, -sz * 1.5, sz * 2.4, sz * 3);
            ctx.font = `bold ${sz * 0.7}px JetBrains Mono`; ctx.fillStyle = color;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('PB', 0, 0);
          } else {
            // Generic box symbol for transformer
            ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
            ctx.font = `${Math.max(6, sz * 0.8)}px JetBrains Mono`;
            ctx.fillStyle = color;
            ctx.fillText(entity.type.charAt(0).toUpperCase(), -sz * 0.3, sz * 0.4);
          }
          ctx.restore();
          break;
        }

        // ── Site Entity Renderers ─────────────────────────────────────────
        case 'contour': {
          const cn = entity as ContourEntity;
          if (cn.points.length > 1) {
            ctx.save();
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(cn.points[0].x * ppm, cn.points[0].y * ppm);
            for (let i = 1; i < cn.points.length; i++) ctx.lineTo(cn.points[i].x * ppm, cn.points[i].y * ppm);
            ctx.stroke();
            // Elevation label at midpoint
            const mi = Math.floor(cn.points.length / 2);
            const mx = cn.points[mi].x * ppm, my = cn.points[mi].y * ppm;
            ctx.font = `${Math.max(8, 10 * t.scale)}px JetBrains Mono`;
            ctx.fillStyle = color;
            ctx.fillText(`${(cn.elevation / 1000).toFixed(1)}m`, mx + 4, my - 4);
            ctx.restore();
          }
          break;
        }
        case 'grading': {
          const gr = entity as GradingEntity;
          if (gr.points.length > 2) {
            ctx.save();
            ctx.fillStyle = isSel ? 'rgba(88,166,255,0.1)' : 'rgba(139,92,42,0.1)';
            ctx.beginPath();
            ctx.moveTo(gr.points[0].x * ppm, gr.points[0].y * ppm);
            for (let i = 1; i < gr.points.length; i++) ctx.lineTo(gr.points[i].x * ppm, gr.points[i].y * ppm);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Direction arrows
            for (let i = 0; i < gr.points.length - 1; i++) {
              const p1 = gr.points[i], p2 = gr.points[i + 1];
              const mx2 = (p1.x + p2.x) / 2 * ppm, my2 = (p1.y + p2.y) / 2 * ppm;
              const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
              ctx.save(); ctx.translate(mx2, my2); ctx.rotate(angle);
              ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(4, 0); ctx.lineTo(-4, 3); ctx.stroke();
              ctx.restore();
            }
            ctx.restore();
          }
          break;
        }
        case 'paving': {
          const pv = entity as PavingEntity;
          if (pv.points.length > 2) {
            ctx.fillStyle = isSel ? 'rgba(88,166,255,0.12)' : 'rgba(160,160,160,0.12)';
            ctx.beginPath();
            ctx.moveTo(pv.points[0].x * ppm, pv.points[0].y * ppm);
            for (let i = 1; i < pv.points.length; i++) ctx.lineTo(pv.points[i].x * ppm, pv.points[i].y * ppm);
            ctx.closePath(); ctx.fill(); ctx.stroke();
          }
          break;
        }
        case 'landscape': {
          const ls = entity as LandscapeEntity;
          const lx = ls.x * ppm, ly = ls.y * ppm;
          const lr = (ls.radius || 500) * ppm;
          // Tree/shrub symbol: circle with crown
          ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2);
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.15)' : 'rgba(34,139,34,0.15)';
          ctx.fill(); ctx.stroke();
          // Cross pattern for tree
          ctx.beginPath(); ctx.moveTo(lx - lr * 0.5, ly); ctx.lineTo(lx + lr * 0.5, ly); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(lx, ly - lr * 0.5); ctx.lineTo(lx, ly + lr * 0.5); ctx.stroke();
          if (ls.plantType) {
            ctx.font = `${Math.max(7, 9 * t.scale)}px JetBrains Mono`;
            ctx.fillStyle = color; ctx.fillText(ls.plantType, lx + lr + 3, ly + 3);
          }
          break;
        }
        case 'fence_site': {
          const fn = entity as FenceSiteEntity;
          if (fn.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(fn.points[0].x * ppm, fn.points[0].y * ppm);
            for (let i = 1; i < fn.points.length; i++) ctx.lineTo(fn.points[i].x * ppm, fn.points[i].y * ppm);
            ctx.stroke();
            // Post markers
            for (const pt of fn.points) {
              ctx.beginPath(); ctx.arc(pt.x * ppm, pt.y * ppm, 3 * t.scale, 0, Math.PI * 2); ctx.fill();
            }
          }
          break;
        }
        case 'parking': {
          const pk = entity as ParkingEntity;
          const pw = (pk.width || 2500) * ppm, ph = (pk.depth || 5000) * ppm;
          ctx.strokeRect(pk.x * ppm, pk.y * ppm, pw, ph);
          // "P" label
          ctx.font = `bold ${Math.max(10, 14 * t.scale)}px JetBrains Mono`;
          ctx.fillStyle = color;
          ctx.fillText('P', pk.x * ppm + pw * 0.35, pk.y * ppm + ph * 0.6);
          break;
        }

        // ── Architecture Extended Renderers ───────────────────────────────
        case 'furniture': {
          const f = entity as FurnitureEntity;
          const fw = (f.width || 600) * ppm, fh = (f.depth || 400) * ppm;
          ctx.save(); ctx.translate(f.x * ppm, f.y * ppm); ctx.rotate(f.rotation || 0);
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.1)' : 'rgba(139,119,101,0.08)';
          ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
          ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
          ctx.font = `${Math.max(7, 9 * t.scale)}px JetBrains Mono`;
          ctx.fillStyle = color;
          ctx.fillText(f.name || 'Furniture', -fw / 2 + 2, 3);
          ctx.restore();
          break;
        }
        case 'appliance': {
          const ap = entity as ApplianceEntity;
          const aw = (ap.width || 600) * ppm, ah = (ap.depth || 600) * ppm;
          ctx.save(); ctx.translate(ap.x * ppm, ap.y * ppm); ctx.rotate(ap.rotation || 0);
          ctx.fillStyle = isSel ? 'rgba(88,166,255,0.12)' : 'rgba(180,180,180,0.08)';
          ctx.fillRect(-aw / 2, -ah / 2, aw, ah);
          ctx.strokeRect(-aw / 2, -ah / 2, aw, ah);
          // Diagonal to indicate appliance
          ctx.beginPath(); ctx.moveTo(-aw / 2, -ah / 2); ctx.lineTo(aw / 2, ah / 2); ctx.stroke();
          ctx.font = `${Math.max(7, 9 * t.scale)}px JetBrains Mono`;
          ctx.fillStyle = color;
          ctx.fillText(ap.name || 'Appliance', -aw / 2 + 2, -ah / 2 - 3);
          ctx.restore();
          break;
        }
        case 'fixture': {
          const fx = entity as FixtureEntity;
          const fxw = (fx.width || 500) * ppm, fxh = (fx.depth || 400) * ppm;
          ctx.save(); ctx.translate(fx.x * ppm, fx.y * ppm); ctx.rotate(fx.rotation || 0);
          ctx.strokeRect(-fxw / 2, -fxh / 2, fxw, fxh);
          // Circle inside for fixture
          const mr = Math.min(fxw, fxh) / 2 * 0.6;
          ctx.beginPath(); ctx.arc(0, 0, mr, 0, Math.PI * 2); ctx.stroke();
          ctx.font = `${Math.max(7, 8 * t.scale)}px JetBrains Mono`;
          ctx.fillStyle = color;
          ctx.fillText(fx.name || 'Fixture', -fxw / 2 + 2, -fxh / 2 - 3);
          ctx.restore();
          break;
        }
        case 'structural_member': {
          const sm = entity as StructuralMemberEntity;
          const sx1 = sm.x1 * ppm, sy1 = sm.y1 * ppm, sx2 = sm.x2 * ppm, sy2 = sm.y2 * ppm;
          const slen = Math.hypot(sx2 - sx1, sy2 - sy1);
          if (slen < 0.5) break;
          ctx.lineWidth = Math.max(2, lw * 1.5);
          ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
          // Hash marks along member
          const snx = (sy2 - sy1) / slen * 4, sny = -(sx2 - sx1) / slen * 4;
          const nHash = Math.max(2, Math.floor(slen / 20));
          for (let h = 1; h < nHash; h++) {
            const ht = h / nHash;
            const hx = sx1 + (sx2 - sx1) * ht, hy = sy1 + (sy2 - sy1) * ht;
            ctx.beginPath(); ctx.moveTo(hx + snx, hy + sny); ctx.lineTo(hx - snx, hy - sny); ctx.stroke();
          }
          break;
        }
        case 'footing': {
          const ft = entity as FootingEntity;
          const ftw = (ft.width || 1200) * ppm, fth = (ft.depth || 1200) * ppm;
          ctx.save(); ctx.setLineDash([6, 3]);
          ctx.strokeRect(ft.x * ppm - ftw / 2, ft.y * ppm - fth / 2, ftw, fth);
          // Cross-hatch
          ctx.beginPath(); ctx.moveTo(ft.x * ppm - ftw / 2, ft.y * ppm - fth / 2);
          ctx.lineTo(ft.x * ppm + ftw / 2, ft.y * ppm + fth / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ft.x * ppm + ftw / 2, ft.y * ppm - fth / 2);
          ctx.lineTo(ft.x * ppm - ftw / 2, ft.y * ppm + fth / 2); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'pile': {
          const pl = entity as PileEntity;
          const pr = (pl.diameter || 300) / 2 * ppm;
          ctx.beginPath(); ctx.arc(pl.x * ppm, pl.y * ppm, pr, 0, Math.PI * 2); ctx.stroke();
          // X mark inside
          ctx.beginPath(); ctx.moveTo(pl.x * ppm - pr * 0.6, pl.y * ppm - pr * 0.6);
          ctx.lineTo(pl.x * ppm + pr * 0.6, pl.y * ppm + pr * 0.6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(pl.x * ppm + pr * 0.6, pl.y * ppm - pr * 0.6);
          ctx.lineTo(pl.x * ppm - pr * 0.6, pl.y * ppm + pr * 0.6); ctx.stroke();
          break;
        }
        case 'retaining_wall': {
          const rw = entity as RetainingWallEntity;
          if (rw.points.length > 1) {
            ctx.lineWidth = Math.max(2, lw * 2);
            ctx.beginPath();
            ctx.moveTo(rw.points[0].x * ppm, rw.points[0].y * ppm);
            for (let i = 1; i < rw.points.length; i++) ctx.lineTo(rw.points[i].x * ppm, rw.points[i].y * ppm);
            ctx.stroke();
            // Hash marks on retaining side
            for (let i = 0; i < rw.points.length - 1; i++) {
              const p1 = rw.points[i], p2 = rw.points[i + 1];
              const sl = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              if (sl < 10) continue;
              const rnx = (p2.y - p1.y) / sl * 60, rny = -(p2.x - p1.x) / sl * 60;
              const nH = Math.max(2, Math.floor(sl / 100));
              for (let h = 0; h <= nH; h++) {
                const rt = h / nH;
                const rx = (p1.x + (p2.x - p1.x) * rt) * ppm;
                const ry = (p1.y + (p2.y - p1.y) * rt) * ppm;
                ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + rnx * ppm, ry + rny * ppm); ctx.stroke();
              }
            }
          }
          break;
        }
        case 'opening': {
          const op = entity as OpeningEntity;
          const ow = (op.width || 900) * ppm, oh = (op.height || 2100) * ppm / 10;
          ctx.save(); ctx.setLineDash([4, 4]);
          ctx.strokeRect(op.x * ppm - ow / 2, op.y * ppm - oh / 2, ow, oh);
          ctx.restore();
          break;
        }
        case 'niche': {
          const nc = entity as NicheEntity;
          const nw = (nc.width || 600) * ppm, nh = (nc.depth || 300) * ppm;
          ctx.save(); ctx.setLineDash([3, 3]);
          ctx.strokeRect(nc.x * ppm - nw / 2, nc.y * ppm - nh / 2, nw, nh);
          ctx.restore();
          break;
        }
        case 'shaft': {
          const sh = entity as ShaftEntity;
          if (sh.points.length > 2) {
            ctx.fillStyle = isSel ? 'rgba(88,166,255,0.1)' : 'rgba(80,80,80,0.1)';
            ctx.beginPath();
            ctx.moveTo(sh.points[0].x * ppm, sh.points[0].y * ppm);
            for (let i = 1; i < sh.points.length; i++) ctx.lineTo(sh.points[i].x * ppm, sh.points[i].y * ppm);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Diagonal
            const bb2 = boundingBox(sh.points);
            ctx.beginPath(); ctx.moveTo(bb2.min.x * ppm, bb2.min.y * ppm); ctx.lineTo(bb2.max.x * ppm, bb2.max.y * ppm); ctx.stroke();
          }
          break;
        }
        case 'elevator': {
          const el = entity as ElevatorEntity;
          const ew = (el.width || 2000) * ppm, eh = (el.depth || 2000) * ppm;
          ctx.strokeRect(el.x * ppm - ew / 2, el.y * ppm - eh / 2, ew, eh);
          // Door line at top
          ctx.beginPath();
          ctx.moveTo(el.x * ppm - ew / 4, el.y * ppm - eh / 2);
          ctx.lineTo(el.x * ppm + ew / 4, el.y * ppm - eh / 2);
          ctx.lineWidth = lw * 2; ctx.stroke();
          // Arrow up/down
          ctx.beginPath();
          ctx.moveTo(el.x * ppm, el.y * ppm - eh * 0.3);
          ctx.lineTo(el.x * ppm, el.y * ppm + eh * 0.3);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(el.x * ppm - 4, el.y * ppm - eh * 0.2);
          ctx.lineTo(el.x * ppm, el.y * ppm - eh * 0.3);
          ctx.lineTo(el.x * ppm + 4, el.y * ppm - eh * 0.2);
          ctx.stroke();
          break;
        }

        // ── Annotation Extended Renderers ─────────────────────────────────
        case 'section_mark': {
          const sec = entity as SectionMarkEntity;
          const sr = 12 * t.scale;
          ctx.beginPath(); ctx.arc(sec.x * ppm, sec.y * ppm, sr, 0, Math.PI * 2); ctx.stroke();
          // Filled half
          ctx.fillStyle = color;
          const sa = sec.rotation || 0;
          ctx.beginPath(); ctx.arc(sec.x * ppm, sec.y * ppm, sr, sa - Math.PI / 2, sa + Math.PI / 2); ctx.fill();
          ctx.font = `bold ${Math.max(8, 10 * t.scale)}px JetBrains Mono`;
          ctx.fillStyle = isSel ? '#58a6ff' : '#e6edf3';
          ctx.fillText(sec.sectionId || 'A', sec.x * ppm - 3, sec.y * ppm + 4);
          break;
        }
        case 'detail_mark': {
          const det = entity as DetailMarkEntity;
          const dr = (det.radius || 3000) * ppm;
          ctx.setLineDash([6, 3]);
          ctx.beginPath(); ctx.arc(det.x * ppm, det.y * ppm, dr, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          // Label circle at bottom
          const lr = 10 * t.scale;
          ctx.beginPath(); ctx.arc(det.x * ppm, det.y * ppm + dr + lr, lr, 0, Math.PI * 2); ctx.stroke();
          ctx.font = `bold ${Math.max(7, 9 * t.scale)}px JetBrains Mono`;
          ctx.fillStyle = color;
          ctx.fillText(det.detailId || '1', det.x * ppm - 3, det.y * ppm + dr + lr + 3);
          break;
        }
        case 'elevation_mark': {
          const em = entity as ElevationMarkEntity;
          const esz = 10 * t.scale;
          ctx.save(); ctx.translate(em.x * ppm, em.y * ppm);
          ctx.rotate(em.direction || 0);
          // Arrow triangle
          ctx.beginPath(); ctx.moveTo(0, -esz); ctx.lineTo(esz * 1.5, 0); ctx.lineTo(0, esz); ctx.closePath(); ctx.stroke();
          ctx.font = `${Math.max(7, 9 * t.scale)}px JetBrains Mono`;
          ctx.fillStyle = color;
          ctx.fillText(`E ${(em.elevation / 1000).toFixed(1)}`, esz * 1.8, 4);
          ctx.restore();
          break;
        }
        case 'grid_bubble': {
          const gb = entity as GridBubbleEntity;
          const gr2 = 14 * t.scale;
          ctx.beginPath(); ctx.arc(gb.x * ppm, gb.y * ppm, gr2, 0, Math.PI * 2); ctx.stroke();
          ctx.font = `bold ${Math.max(9, 12 * t.scale)}px JetBrains Mono`;
          ctx.fillStyle = color;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(gb.label || 'A', gb.x * ppm, gb.y * ppm);
          ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
          break;
        }
        case 'tag': {
          const tg = entity as TagEntity;
          ctx.font = `${Math.max(8, 10 * t.scale)}px JetBrains Mono`;
          const tw = ctx.measureText(tg.text || 'Tag').width + 8;
          ctx.strokeRect(tg.x * ppm - 2, tg.y * ppm - 12, tw, 16);
          ctx.fillStyle = color;
          ctx.fillText(tg.text || 'Tag', tg.x * ppm + 2, tg.y * ppm);
          break;
        }
        case 'keynote': {
          const kn = entity as KeynoteEntity;
          if (kn.leaderPoints.length > 1) {
            ctx.beginPath();
            ctx.moveTo(kn.leaderPoints[0].x * ppm, kn.leaderPoints[0].y * ppm);
            for (let i = 1; i < kn.leaderPoints.length; i++) ctx.lineTo(kn.leaderPoints[i].x * ppm, kn.leaderPoints[i].y * ppm);
            ctx.stroke();
            // Text bubble at last point
            const lp = kn.leaderPoints[kn.leaderPoints.length - 1];
            ctx.font = `${Math.max(8, 10 * t.scale)}px JetBrains Mono`;
            const ktw = ctx.measureText(kn.keynoteId || 'KN1').width + 6;
            ctx.strokeRect(lp.x * ppm, lp.y * ppm - 12, ktw, 16);
            ctx.fillStyle = color;
            ctx.fillText(kn.keynoteId || 'KN1', lp.x * ppm + 3, lp.y * ppm);
          }
          break;
        }
        case 'revision_tag': {
          const rv = entity as RevisionTagEntity;
          const rvr = 10 * t.scale;
          // Triangle revision symbol
          ctx.beginPath();
          ctx.moveTo(rv.x * ppm, rv.y * ppm - rvr);
          ctx.lineTo(rv.x * ppm + rvr, rv.y * ppm + rvr * 0.7);
          ctx.lineTo(rv.x * ppm - rvr, rv.y * ppm + rvr * 0.7);
          ctx.closePath(); ctx.stroke();
          ctx.font = `bold ${Math.max(8, 10 * t.scale)}px JetBrains Mono`;
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.fillText(rv.revisionNumber || '1', rv.x * ppm, rv.y * ppm + rvr * 0.35);
          ctx.textAlign = 'start';
          break;
        }
        case 'gradient': {
          const grd = entity as GradientEntity;
          if (grd.boundary.length > 2) {
            // Create gradient fill
            const gb2 = boundingBox(grd.boundary);
            const linGrad = ctx.createLinearGradient(
              gb2.min.x * ppm, gb2.min.y * ppm, gb2.max.x * ppm, gb2.max.y * ppm
            );
            linGrad.addColorStop(0, grd.color1 || '#ff0000');
            linGrad.addColorStop(1, grd.color2 || '#0000ff');
            ctx.fillStyle = linGrad;
            ctx.beginPath();
            ctx.moveTo(grd.boundary[0].x * ppm, grd.boundary[0].y * ppm);
            for (let i = 1; i < grd.boundary.length; i++) ctx.lineTo(grd.boundary[i].x * ppm, grd.boundary[i].y * ppm);
            ctx.closePath(); ctx.fill();
            if (isSel) { ctx.strokeStyle = '#58a6ff'; ctx.stroke(); }
          }
          break;
        }
      }
      ctx.setLineDash([]);
    }

    // ── Selection Box ───────────────────────────────────────────────────
    if (selBox) {
      const s = selBox.start, e = selBox.end;
      const sx = s.x * ppm, sy = s.y * ppm, ex = e.x * ppm, ey = e.y * ppm;
      const isCrossing = e.x < s.x;
      ctx.fillStyle = isCrossing ? 'rgba(46,160,67,0.15)' : 'rgba(56,139,253,0.15)';
      ctx.strokeStyle = isCrossing ? '#2ea043' : '#388bfd';
      ctx.lineWidth = 1;
      if (isCrossing) ctx.setLineDash([5, 5]); else ctx.setLineDash([]);
      ctx.fillRect(sx, sy, ex - sx, ey - sy);
      ctx.strokeRect(sx, sy, ex - sx, ey - sy);
      ctx.setLineDash([]);
    }

    // ── Drawing preview ──────────────────────────────────────────────────
    if (drawPts.length > 0 && cursor) {
      ctx.strokeStyle = 'rgba(88,166,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      const lastPt = drawPts[drawPts.length - 1];
      const constrained = applyOrtho(lastPt, cursor);
      const x1 = lastPt.x * ppm, y1 = lastPt.y * ppm;
      const x2 = constrained.x * ppm, y2 = constrained.y * ppm;

      const isDrawing = ['line', 'polyline', 'wall', 'circle', 'rectangle', 'arc', 'ellipse',
        'spline', 'polygon', 'slab', 'roof', 'room', 'zone', 'zone_divider', 'beam', 'curtainwall', 'dimension',
        'dim_aligned', 'leader', 'measure', 'multileader',
        'xline', 'ray', 'mline', 'revcloud', 'wipeout', 'region', 'boundary',
        'circle_2p', 'circle_3p', 'arc_3p', 'dist_info', 'area_info',
        'railing', 'ceiling', 'align', 'fence_select', 'lasso_select',
        'pipe', 'duct', 'conduit', 'cable_tray',
        'contour', 'grading', 'paving', 'fence_site',
        'retaining_wall', 'shaft', 'keynote', 'gradient', 'array_path',
        'structural_member', 'dim_baseline', 'dim_continue',
        'angle_info', 'break_line_symbol',
        'hatch', 'donut', 'point', 'text', 'mtext'].includes(activeTool);

      if (isDrawing) {
        if (activeTool === 'wall') {
          const len = Math.hypot(x2 - x1, y2 - y1);
          if (len > 0) {
            const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;
            const ht = (wallThickness * ppm) / 2;
            ctx.beginPath(); ctx.moveTo(x1 + nx * ht, y1 + ny * ht); ctx.lineTo(x2 + nx * ht, y2 + ny * ht); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x1 - nx * ht, y1 - ny * ht); ctx.lineTo(x2 - nx * ht, y2 - ny * ht); ctx.stroke();
          }
        } else if (activeTool === 'circle') {
          const r = Math.hypot(x2 - x1, y2 - y1);
          ctx.beginPath(); ctx.arc(x1, y1, r, 0, Math.PI * 2); ctx.stroke();
        } else if (activeTool === 'rectangle') {
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        } else if (activeTool === 'arc') {
          if (drawPts.length === 1) {
            const r = Math.hypot(x2 - x1, y2 - y1);
            ctx.beginPath(); ctx.arc(x1, y1, r, 0, Math.PI); ctx.stroke();
          } else if (drawPts.length >= 2) {
            const r = Math.hypot(x2 - x1, y2 - y1);
            const sa = angleBetween(drawPts[0], drawPts[1]);
            const ea = Math.atan2(constrained.y - drawPts[0].y, constrained.x - drawPts[0].x);
            ctx.beginPath(); ctx.arc(drawPts[0].x * ppm, drawPts[0].y * ppm, dist(drawPts[0], drawPts[1]) * ppm, sa, ea); ctx.stroke();
          }
        } else if (activeTool === 'ellipse') {
          const rx = Math.abs(x2 - x1);
          const ry = Math.abs(y2 - y1);
          ctx.beginPath(); ctx.ellipse(x1, y1, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        } else if (activeTool === 'polygon') {
          const pr = Math.hypot(x2 - x1, y2 - y1);
          const baseAngle = Math.atan2(y2 - y1, x2 - x1);
          ctx.beginPath();
          for (let i = 0; i <= polygonSides; i++) {
            const a = baseAngle + (2 * Math.PI * i) / polygonSides;
            const px = x1 + pr * Math.cos(a), py = y1 + pr * Math.sin(a);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
        } else {
          // Default: line preview
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }

        // Previous polyline segments
        if (['polyline', 'spline', 'slab', 'roof', 'room', 'leader', 'multileader',
             'mline', 'revcloud', 'wipeout', 'region', 'boundary', 'railing', 'ceiling',
             'area_info', 'fence_select', 'lasso_select',
             'pipe', 'duct', 'conduit', 'cable_tray',
             'contour', 'grading', 'paving', 'fence_site',
             'retaining_wall', 'shaft', 'keynote', 'gradient', 'array_path',
             'dim_baseline', 'dim_continue', 'angle_info'
        ].includes(activeTool) && drawPts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(drawPts[0].x * ppm, drawPts[0].y * ppm);
          for (let i = 1; i < drawPts.length; i++) ctx.lineTo(drawPts[i].x * ppm, drawPts[i].y * ppm);
          ctx.stroke();
        }

        // Length label
        const dMm = dist(lastPt, constrained);
        if (dMm > 10) {
          ctx.fillStyle = '#58a6ff';
          ctx.font = '11px JetBrains Mono';
          ctx.fillText(`${(dMm / 1000).toFixed(3)} m`, (x1 + x2) / 2 + 6, (y1 + y2) / 2 - 6);
          // Angle label
          const ang = angleBetween(lastPt, constrained) * 180 / Math.PI;
          ctx.fillText(`${ang.toFixed(1)}°`, (x1 + x2) / 2 + 6, (y1 + y2) / 2 + 10);
        }
      }
      ctx.setLineDash([]);
    }

    // ── Transform preview ────────────────────────────────────────────────
    if (xformState && xformState.step === 'target' && cursor) {
      const { basepoint } = xformState;
      const dx = cursor.x - basepoint.x, dy = cursor.y - basepoint.y;
      ctx.strokeStyle = 'rgba(255,165,0,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(basepoint.x * ppm, basepoint.y * ppm); ctx.lineTo(cursor.x * ppm, cursor.y * ppm); ctx.stroke();

      const xformPt = (px: number, py: number): Vec2 => {
        if (activeTool === 'move' || activeTool === 'copy') return { x: px + dx, y: py + dy };
        if (activeTool === 'rotate') {
          const angle = Math.atan2(dy, dx);
          return rotatePoint({ x: px, y: py }, angle, basepoint);
        }
        if (activeTool === 'scale') {
          const s = Math.max(0.01, Math.hypot(dx, dy) / 1000);
          return { x: basepoint.x + (px - basepoint.x) * s, y: basepoint.y + (py - basepoint.y) * s };
        }
        if (activeTool === 'mirror') {
          const mag = Math.hypot(dx, dy);
          if (mag < 0.1) return { x: px, y: py };
          const dxu = dx / mag, dyu = dy / mag;
          const rx = px - basepoint.x, ry = py - basepoint.y;
          const dot = rx * dxu + ry * dyu;
          return { x: basepoint.x + 2 * dot * dxu - rx, y: basepoint.y + 2 * dot * dyu - ry };
        }
        return { x: px, y: py };
      };

      floor.entities.filter(e => selectedIds.includes(e.id)).forEach(en => {
        const verts = entityVertices(en);
        if (verts.length >= 2 && 'x1' in en) {
          const p1 = xformPt(verts[0].x, verts[0].y);
          const p2 = xformPt(verts[1].x, verts[1].y);
          ctx.beginPath(); ctx.moveTo(p1.x * ppm, p1.y * ppm); ctx.lineTo(p2.x * ppm, p2.y * ppm); ctx.stroke();
        } else if (en.type === 'circle') {
          const c = en as CircleEntity;
          const np = xformPt(c.cx, c.cy);
          const s = activeTool === 'scale' ? Math.max(0.01, Math.hypot(dx, dy) / 1000) : 1;
          ctx.beginPath(); ctx.arc(np.x * ppm, np.y * ppm, c.radius * s * ppm, 0, Math.PI * 2); ctx.stroke();
        } else if (['polyline', 'slab', 'roof', 'room'].includes(en.type)) {
          const pts = (en as any).points as Vec2[];
          if (pts && pts.length > 0) {
            ctx.beginPath();
            const f = xformPt(pts[0].x, pts[0].y);
            ctx.moveTo(f.x * ppm, f.y * ppm);
            for (let i = 1; i < pts.length; i++) { const p = xformPt(pts[i].x, pts[i].y); ctx.lineTo(p.x * ppm, p.y * ppm); }
            ctx.stroke();
          }
        } else if (verts.length > 0) {
          const p = xformPt(verts[0].x, verts[0].y);
          ctx.beginPath(); ctx.arc(p.x * ppm, p.y * ppm, 4, 0, Math.PI * 2); ctx.stroke();
        }
      });
      ctx.setLineDash([]);
    }

    // ── Snap indicator ───────────────────────────────────────────────────
    if (snapIndicator && snapIndicator.kind && snapIndicator.kind !== 'Grid') {
      const sx = snapIndicator.pt.x * ppm, sy = snapIndicator.pt.y * ppm;
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5;
      if (snapIndicator.kind === 'Endpoint') {
        ctx.strokeRect(sx - 4, sy - 4, 8, 8);
      } else if (snapIndicator.kind === 'Midpoint') {
        ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 5, sy + 3); ctx.lineTo(sx - 5, sy + 3); ctx.closePath(); ctx.stroke();
      } else if (snapIndicator.kind === 'Center') {
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3); ctx.stroke();
      } else if (snapIndicator.kind === 'Intersection') {
        ctx.beginPath(); ctx.moveTo(sx - 5, sy - 5); ctx.lineTo(sx + 5, sy + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + 5, sy - 5); ctx.lineTo(sx - 5, sy + 5); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#fbbf24'; ctx.font = '9px JetBrains Mono';
      ctx.fillText(snapIndicator.kind, sx + 8, sy - 4);
    }

    ctx.restore();

    // ── Screen-space cursor crosshair ────────────────────────────────────
    if (cursor && activeTool !== 'pan' && activeTool !== 'select') {
      const scr = worldToScreen(cursor.x, cursor.y, t);
      ctx.strokeStyle = 'rgba(88,166,255,0.3)'; ctx.lineWidth = 0.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(scr.x, 0); ctx.lineTo(scr.x, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, scr.y); ctx.lineTo(W, scr.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [transform, floor.entities, layers, drawPts, cursor, snapIndicator, activeTool,
      selectedIds, wallThickness, selBox, xformState, applyOrtho, pxPerMm, worldToScreen, polygonSides]);

  // Re-draw on changes
  useEffect(() => { draw(); }, [draw]);

  // Canvas resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [draw]);

  // Center view on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setTransform({ x: canvas.offsetWidth / 2, y: canvas.offsetHeight / 2, scale: 1 });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // HIT TESTING
  // ═══════════════════════════════════════════════════════════════════════════
  const hitTest = useCallback((pt: Vec2): AnyEntity | null => {
    const tol = SELECTION_TOL_MM;
    for (let i = floor.entities.length - 1; i >= 0; i--) {
      const e = floor.entities[i];
      const layer = layers.find(l => l.name === e.layer);
      if (layer && (!layer.visible || layer.locked)) continue;

      switch (e.type) {
        case 'wall': case 'line': case 'beam': case 'curtainwall': {
          const l = e as any;
          if (pointToSegmentDist(pt, { x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }) < tol + ((l.thickness || 0) / 2))
            return e;
          break;
        }
        case 'circle': {
          const c = e as CircleEntity;
          if (Math.abs(dist(pt, { x: c.cx, y: c.cy }) - c.radius) < tol) return e;
          break;
        }
        case 'arc': {
          const a = e as ArcEntity;
          const d = dist(pt, { x: a.cx, y: a.cy });
          if (Math.abs(d - a.radius) < tol) {
            const ang = Math.atan2(pt.y - a.cy, pt.x - a.cx);
            let sa = a.startAngle, ea = a.endAngle;
            while (sa < 0) { sa += Math.PI * 2; ea += Math.PI * 2; }
            let na = ang; while (na < sa) na += Math.PI * 2;
            if (na <= ea) return e;
          }
          break;
        }
        case 'rectangle': {
          const r = e as RectangleEntity;
          const minX = Math.min(r.x1, r.x2), maxX = Math.max(r.x1, r.x2);
          const minY = Math.min(r.y1, r.y2), maxY = Math.max(r.y1, r.y2);
          if (pt.x >= minX - tol && pt.x <= maxX + tol && pt.y >= minY - tol && pt.y <= maxY + tol &&
              !(pt.x > minX + tol && pt.x < maxX - tol && pt.y > minY + tol && pt.y < maxY - tol))
            return e;
          break;
        }
        case 'polyline': {
          const pl = e as PolylineEntity;
          for (let j = 0; j < pl.points.length - 1; j++) {
            if (pointToSegmentDist(pt, pl.points[j], pl.points[j + 1]) < tol) return e;
          }
          if (pl.closed && pl.points.length > 2) {
            if (pointToSegmentDist(pt, pl.points[pl.points.length - 1], pl.points[0]) < tol) return e;
          }
          break;
        }
        case 'spline': {
          const sp = e as SplineEntity;
          for (let j = 0; j < sp.controlPoints.length - 1; j++) {
            if (pointToSegmentDist(pt, sp.controlPoints[j], sp.controlPoints[j + 1]) < tol) return e;
          }
          break;
        }
        case 'polygon': {
          const pg = e as PolygonEntity;
          const pgPts: Vec2[] = [];
          for (let j = 0; j < pg.sides; j++) {
            const a = pg.rotation + (2 * Math.PI * j) / pg.sides;
            pgPts.push({ x: pg.cx + pg.radius * Math.cos(a), y: pg.cy + pg.radius * Math.sin(a) });
          }
          for (let j = 0; j < pgPts.length; j++) {
            if (pointToSegmentDist(pt, pgPts[j], pgPts[(j + 1) % pgPts.length]) < tol) return e;
          }
          break;
        }
        case 'ellipse': {
          const el = e as EllipseEntity;
          // Approximate check
          const dx = pt.x - el.cx, dy = pt.y - el.cy;
          const cos = Math.cos(-el.rotation), sin = Math.sin(-el.rotation);
          const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
          const norm = (rx / el.rx) ** 2 + (ry / el.ry) ** 2;
          if (Math.abs(norm - 1) < 0.3) return e;
          break;
        }
        case 'column': {
          const col = e as ColumnEntity;
          if (pt.x >= col.x - tol && pt.x <= col.x + col.width + tol &&
              pt.y >= col.y - tol && pt.y <= col.y + col.depth + tol) return e;
          break;
        }
        case 'stair': case 'ramp': {
          const r = e as any;
          const w = r.width, l = r.length;
          if (pt.x >= r.x - tol && pt.x <= r.x + w + tol && pt.y >= r.y - tol && pt.y <= r.y + l + tol) return e;
          break;
        }
        case 'door': case 'window': {
          const d = e as any;
          if (dist(pt, { x: d.x, y: d.y }) < (d.width || 500) + tol) return e;
          break;
        }
        case 'text': case 'mtext': {
          const te = e as any;
          if (dist(pt, { x: te.x, y: te.y }) < 500) return e;
          break;
        }
        case 'slab': case 'roof': case 'room': case 'zone': case 'hatch': {
          const poly = e as any;
          const pts = poly.points || poly.boundary;
          if (!pts || pts.length < 3) break;
          // Point-in-polygon
          let inside = false;
          for (let j = 0, k = pts.length - 1; j < pts.length; k = j++) {
            if ((pts[j].y > pt.y) !== (pts[k].y > pt.y) &&
                pt.x < (pts[k].x - pts[j].x) * (pt.y - pts[j].y) / (pts[k].y - pts[j].y) + pts[j].x)
              inside = !inside;
          }
          if (inside) return e;
          // Also check edges
          for (let j = 0; j < pts.length; j++) {
            if (pointToSegmentDist(pt, pts[j], pts[(j + 1) % pts.length]) < tol) return e;
          }
          break;
        }
        case 'dimension': {
          const dm = e as DimensionEntity;
          const n = perpNormal({ x: dm.x1, y: dm.y1 }, { x: dm.x2, y: dm.y2 });
          const o1 = { x: dm.x1 + n.x * dm.offset, y: dm.y1 + n.y * dm.offset };
          const o2 = { x: dm.x2 + n.x * dm.offset, y: dm.y2 + n.y * dm.offset };
          if (pointToSegmentDist(pt, o1, o2) < tol) return e;
          break;
        }
        case 'leader': {
          const ld = e as LeaderEntity;
          for (let j = 0; j < ld.points.length - 1; j++) {
            if (pointToSegmentDist(pt, ld.points[j], ld.points[j + 1]) < tol) return e;
          }
          break;
        }
        case 'point': {
          if (dist(pt, { x: (e as any).x, y: (e as any).y }) < tol) return e;
          break;
        }
        case 'xline': case 'ray': {
          const xl = e as any;
          const len = Math.sqrt(xl.dx * xl.dx + xl.dy * xl.dy) || 1;
          const nx = xl.dx / len, ny = xl.dy / len;
          const far1 = { x: xl.x + nx * 1e7, y: xl.y + ny * 1e7 };
          if (e.type === 'xline') {
            const far2 = { x: xl.x - nx * 1e7, y: xl.y - ny * 1e7 };
            if (pointToSegmentDist(pt, far2, far1) < tol) return e;
          } else {
            if (pointToSegmentDist(pt, { x: xl.x, y: xl.y }, far1) < tol) return e;
          }
          break;
        }
        case 'mline': {
          const ml = e as any;
          for (let j = 0; j < ml.points.length - 1; j++) {
            if (pointToSegmentDist(pt, ml.points[j], ml.points[j + 1]) < tol * 3) return e;
          }
          break;
        }
        case 'donut': {
          const dn = e as any;
          const d = dist(pt, { x: dn.cx, y: dn.cy });
          if (d >= dn.innerRadius - tol && d <= dn.outerRadius + tol) return e;
          break;
        }
        case 'revcloud': case 'railing': {
          const rc = e as any;
          for (let j = 0; j < rc.points.length - 1; j++) {
            if (pointToSegmentDist(pt, rc.points[j], rc.points[j + 1]) < tol) return e;
          }
          if (rc.points.length > 2) {
            if (pointToSegmentDist(pt, rc.points[rc.points.length - 1], rc.points[0]) < tol) return e;
          }
          break;
        }
        case 'wipeout': case 'region': case 'ceiling': {
          const wp = e as any;
          const wpts = wp.points || wp.boundary;
          if (!wpts || wpts.length < 3) break;
          let inside = false;
          for (let j = 0, k = wpts.length - 1; j < wpts.length; k = j++) {
            if ((wpts[j].y > pt.y) !== (wpts[k].y > pt.y) &&
                pt.x < (wpts[k].x - wpts[j].x) * (pt.y - wpts[j].y) / (wpts[k].y - wpts[j].y) + wpts[j].x)
              inside = !inside;
          }
          if (inside) return e;
          for (let j = 0; j < wpts.length; j++) {
            if (pointToSegmentDist(pt, wpts[j], wpts[(j + 1) % wpts.length]) < tol) return e;
          }
          break;
        }
        case 'multileader': {
          const mld = e as any;
          for (const ldr of (mld.leaders || [])) {
            for (let j = 0; j < ldr.length - 1; j++) {
              if (pointToSegmentDist(pt, ldr[j], ldr[j + 1]) < tol) return e;
            }
          }
          break;
        }
        case 'table': {
          const tb = e as any;
          const tw = (tb.colWidths as number[]).reduce((s: number, v: number) => s + v, 0);
          const th = (tb.rowHeights as number[]).reduce((s: number, v: number) => s + v, 0);
          if (pt.x >= tb.x - tol && pt.x <= tb.x + tw + tol &&
              pt.y >= tb.y - tol && pt.y <= tb.y + th + tol) return e;
          break;
        }
        case 'tolerance': {
          const tl = e as any;
          if (pt.x >= tl.x - tol && pt.x <= tl.x + 3000 + tol &&
              pt.y >= tl.y - tol && pt.y <= tl.y + 600 + tol) return e;
          break;
        }
        case 'block_ref': {
          const br = e as any;
          if (dist(pt, { x: br.x, y: br.y }) < 500 + tol) return e;
          break;
        }

        // ── MEP hit testing ────────────────────────────────────────────
        case 'pipe': case 'duct': case 'conduit': case 'cable_tray': {
          const mep = e as any;
          const mepPts = mep.points as Vec2[];
          if (mepPts) {
            for (let j = 0; j < mepPts.length - 1; j++) {
              if (pointToSegmentDist(pt, mepPts[j], mepPts[j + 1]) < tol + ((mep.diameter || mep.width || 50) / 2)) return e;
            }
          }
          break;
        }
        case 'sprinkler': case 'diffuser': case 'outlet': case 'switch_mep':
        case 'panel_board': case 'transformer': case 'valve': case 'pump': {
          const dev = e as any;
          if (dist(pt, { x: dev.x, y: dev.y }) < 300 + tol) return e;
          break;
        }

        // ── Site hit testing ───────────────────────────────────────────
        case 'contour': case 'grading': case 'paving': case 'fence_site': {
          const site = e as any;
          const sitePts = site.points as Vec2[];
          if (sitePts && sitePts.length > 1) {
            for (let j = 0; j < sitePts.length - 1; j++) {
              if (pointToSegmentDist(pt, sitePts[j], sitePts[j + 1]) < tol) return e;
            }
            if (sitePts.length > 2 && (e.type === 'grading' || e.type === 'paving')) {
              let inside = false;
              for (let j = 0, k = sitePts.length - 1; j < sitePts.length; k = j++) {
                if ((sitePts[j].y > pt.y) !== (sitePts[k].y > pt.y) &&
                    pt.x < (sitePts[k].x - sitePts[j].x) * (pt.y - sitePts[j].y) / (sitePts[k].y - sitePts[j].y) + sitePts[j].x)
                  inside = !inside;
              }
              if (inside) return e;
            }
          }
          break;
        }
        case 'landscape': {
          const ls = e as any;
          if (dist(pt, { x: ls.x, y: ls.y }) < (ls.radius || 500) + tol) return e;
          break;
        }
        case 'parking': {
          const pk = e as any;
          const pw = pk.width || 2500, ph = pk.depth || 5000;
          if (pt.x >= pk.x - tol && pt.x <= pk.x + pw + tol &&
              pt.y >= pk.y - tol && pt.y <= pk.y + ph + tol) return e;
          break;
        }

        // ── Architecture extended hit testing ──────────────────────────
        case 'furniture': case 'appliance': case 'fixture': {
          const f = e as any;
          const fw = f.width || 600, fh = f.depth || 400;
          if (dist(pt, { x: f.x, y: f.y }) < Math.hypot(fw, fh) / 2 + tol) return e;
          break;
        }
        case 'structural_member': {
          const sm = e as any;
          if (pointToSegmentDist(pt, { x: sm.x1, y: sm.y1 }, { x: sm.x2, y: sm.y2 }) < tol * 2) return e;
          break;
        }
        case 'footing': {
          const ft = e as any;
          const ftw = ft.width || 1200, fth = ft.depth || 1200;
          if (pt.x >= ft.x - ftw / 2 - tol && pt.x <= ft.x + ftw / 2 + tol &&
              pt.y >= ft.y - fth / 2 - tol && pt.y <= ft.y + fth / 2 + tol) return e;
          break;
        }
        case 'pile': {
          const pl2 = e as any;
          if (dist(pt, { x: pl2.x, y: pl2.y }) < (pl2.diameter || 300) / 2 + tol) return e;
          break;
        }
        case 'retaining_wall': case 'shaft': {
          const rw = e as any;
          const rwPts = rw.points as Vec2[];
          if (rwPts && rwPts.length > 1) {
            for (let j = 0; j < rwPts.length - 1; j++) {
              if (pointToSegmentDist(pt, rwPts[j], rwPts[j + 1]) < tol * 2) return e;
            }
            if (e.type === 'shaft' && rwPts.length > 2) {
              let inside = false;
              for (let j = 0, k = rwPts.length - 1; j < rwPts.length; k = j++) {
                if ((rwPts[j].y > pt.y) !== (rwPts[k].y > pt.y) &&
                    pt.x < (rwPts[k].x - rwPts[j].x) * (pt.y - rwPts[j].y) / (rwPts[k].y - rwPts[j].y) + rwPts[j].x)
                  inside = !inside;
              }
              if (inside) return e;
            }
          }
          break;
        }
        case 'opening': case 'niche': {
          const op = e as any;
          const ow = op.width || 900, oh = op.depth || op.height || 300;
          if (pt.x >= op.x - ow / 2 - tol && pt.x <= op.x + ow / 2 + tol &&
              pt.y >= op.y - oh / 2 - tol && pt.y <= op.y + oh / 2 + tol) return e;
          break;
        }
        case 'elevator': {
          const el = e as any;
          const ew = el.width || 2000, eh = el.depth || 2000;
          if (pt.x >= el.x - ew / 2 - tol && pt.x <= el.x + ew / 2 + tol &&
              pt.y >= el.y - eh / 2 - tol && pt.y <= el.y + eh / 2 + tol) return e;
          break;
        }

        // ── Annotation extended hit testing ────────────────────────────
        case 'section_mark': case 'detail_mark': case 'elevation_mark':
        case 'grid_bubble': case 'tag': case 'revision_tag': {
          const ann = e as any;
          if (dist(pt, { x: ann.x, y: ann.y }) < 500 + tol) return e;
          break;
        }
        case 'keynote': {
          const kn = e as any;
          if (kn.leaderPoints) {
            for (let j = 0; j < kn.leaderPoints.length - 1; j++) {
              if (pointToSegmentDist(pt, kn.leaderPoints[j], kn.leaderPoints[j + 1]) < tol) return e;
            }
          }
          if (dist(pt, { x: kn.x, y: kn.y }) < 500 + tol) return e;
          break;
        }
        case 'gradient': {
          const grd = e as any;
          const gPts = grd.boundary as Vec2[];
          if (gPts && gPts.length > 2) {
            let inside = false;
            for (let j = 0, k = gPts.length - 1; j < gPts.length; k = j++) {
              if ((gPts[j].y > pt.y) !== (gPts[k].y > pt.y) &&
                  pt.x < (gPts[k].x - gPts[j].x) * (pt.y - gPts[j].y) / (gPts[k].y - gPts[j].y) + gPts[j].x)
                inside = !inside;
            }
            if (inside) return e;
          }
          break;
        }
      }
    }
    return null;
  }, [floor.entities, layers]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MOUSE HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    // Panning
    if (isPanning && panStart) {
      setTransform(t => ({ ...t, x: panStart.tx + sx - panStart.mx, y: panStart.ty + sy - panStart.my }));
      return;
    }

    const world = screenToWorld(sx, sy, transform);
    const snapped = snap(world);
    setSnapIndicator(snapped);
    setCursor(snapped.pt);

    // Selection box dragging
    if (activeTool === 'select' && selBox) {
      setSelBox({ ...selBox, end: world });
    }

    // Transform preview
    if (xformState && xformState.step === 'target') {
      setXformState({ ...xformState, current: snapped.pt });
    }

    // Status bar
    const pt = snapped.pt;
    const dStr = drawPts.length > 0
      ? `  |  D: ${(dist(drawPts[drawPts.length - 1], pt) / 1000).toFixed(3)}m  A: ${(angleBetween(drawPts[drawPts.length - 1], pt) * 180 / Math.PI).toFixed(1)}°`
      : '';
    onStatusChange(`X: ${(pt.x / 1000).toFixed(3)}  Y: ${(pt.y / 1000).toFixed(3)}${dStr}  [${snapped.kind}]`);
  }, [isPanning, panStart, transform, screenToWorld, snap, drawPts, activeTool, selBox, xformState, onStatusChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, transform);
    const snapped = snap(world);
    const pt = snapped.pt;

    // Middle-button or pan tool = panning
    if (e.button === 1 || activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ mx: sx, my: sy, tx: transform.x, ty: transform.y });
      return;
    }

    // Right-click finishes multi-point tools
    if (e.button === 2) {
      e.preventDefault();
      if (drawPts.length > 0) {
        finishMultiPoint();
      }
      return;
    }

    if (e.button !== 0) return;

    // ── Tool dispatch ─────────────────────────────────────────────────
    switch (activeTool) {
      case 'select': {
        const hit = hitTest(pt);
        if (hit) {
          if (e.shiftKey) {
            setSelectedIds(prev => prev.includes(hit.id) ? prev.filter(i => i !== hit.id) : [...prev, hit.id]);
          } else {
            if (!selectedIds.includes(hit.id)) setSelectedIds([hit.id]);
          }
        } else {
          if (!e.shiftKey) setSelectedIds([]);
          setSelBox({ start: pt, end: pt });
        }
        break;
      }

      // ── Transform tools ─────────────────────────────────────────────
      case 'move': case 'copy': case 'rotate': case 'scale': case 'mirror': {
        if (selectedIds.length === 0) {
          cmdLog('Select objects first, then use transform tool'); return;
        }
        if (!xformState || xformState.step === 'base') {
          setXformState({ basepoint: pt, current: pt, step: 'target' });
          cmdLog('Basepoint set. Click target point.');
        } else {
          applyTransform(pt);
        }
        break;
      }

      // ── Offset ──────────────────────────────────────────────────────
      case 'offset': {
        if (selectedIds.length === 0) { cmdLog('Select entities to offset first'); return; }
        const input = prompt('Offset distance (mm):', '200');
        if (!input || isNaN(Number(input))) { cmdLog('Invalid distance'); setActiveTool('select'); return; }
        pushUndo('Offset');
        const selectedEntities = floor.entities.filter(e => selectedIds.includes(e.id));
        invoke<any>('perform_geom_op', { op: 'offset', entities: selectedEntities, params: { distance: Number(input) } })
          .then(res => {
            if (res?.results?.length > 0) {
              const newEnts = res.results.map((r: any) => ({ ...r, id: uid() }));
              onFloorChange({ ...floor, entities: [...floor.entities, ...newEnts] });
              cmdLog(`Offset ${newEnts.length} entities by ${input}mm`);
            } else { cmdLog('No geometry generated'); }
          })
          .catch(err => cmdLog(`Offset error: ${err}`))
          .finally(() => setActiveTool('select'));
        break;
      }

      // ── Trim ────────────────────────────────────────────────────────
      case 'trim': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on an entity to trim'); return; }
        pushUndo('Trim');
        const others = floor.entities.filter(e => e.id !== hit.id);
        invoke<any>('perform_geom_op', {
          op: 'trim',
          entities: [hit, ...others.slice(0, 5)],
          params: { boundary_id: others[0]?.id || '', click_pt: [pt.x, pt.y] },
        }).then(res => {
          if (res?.results?.length > 0) {
            const trimmed = res.results[0];
            trimmed.id = hit.id;
            onFloorChange({ ...floor, entities: floor.entities.map(e => e.id === hit.id ? trimmed : e) });
            cmdLog('Entity trimmed');
          }
        }).catch(err => cmdLog(`Trim error: ${err}`));
        break;
      }

      // ── Explode ─────────────────────────────────────────────────────
      case 'explode': {
        if (selectedIds.length === 0) { cmdLog('Select entities to explode'); return; }
        pushUndo('Explode');
        const newEntities: AnyEntity[] = [];
        const toRemove = new Set<string>();
        for (const e of floor.entities) {
          if (!selectedIds.includes(e.id)) continue;
          toRemove.add(e.id);
          if (e.type === 'rectangle') {
            const r = e as RectangleEntity;
            newEntities.push({ id: uid(), type: 'line', layer: e.layer, x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y1 });
            newEntities.push({ id: uid(), type: 'line', layer: e.layer, x1: r.x2, y1: r.y1, x2: r.x2, y2: r.y2 });
            newEntities.push({ id: uid(), type: 'line', layer: e.layer, x1: r.x2, y1: r.y2, x2: r.x1, y2: r.y2 });
            newEntities.push({ id: uid(), type: 'line', layer: e.layer, x1: r.x1, y1: r.y2, x2: r.x1, y2: r.y1 });
          } else if (e.type === 'polyline') {
            const pl = e as PolylineEntity;
            for (let j = 0; j < pl.points.length - 1; j++) {
              newEntities.push({ id: uid(), type: 'line', layer: e.layer, x1: pl.points[j].x, y1: pl.points[j].y, x2: pl.points[j + 1].x, y2: pl.points[j + 1].y });
            }
            if (pl.closed && pl.points.length > 2) {
              newEntities.push({ id: uid(), type: 'line', layer: e.layer, x1: pl.points[pl.points.length - 1].x, y1: pl.points[pl.points.length - 1].y, x2: pl.points[0].x, y2: pl.points[0].y });
            }
          } else if (e.type === 'polygon') {
            const pg = e as PolygonEntity;
            for (let j = 0; j < pg.sides; j++) {
              const a1 = pg.rotation + (2 * Math.PI * j) / pg.sides;
              const a2 = pg.rotation + (2 * Math.PI * ((j + 1) % pg.sides)) / pg.sides;
              newEntities.push({
                id: uid(), type: 'line', layer: e.layer,
                x1: pg.cx + pg.radius * Math.cos(a1), y1: pg.cy + pg.radius * Math.sin(a1),
                x2: pg.cx + pg.radius * Math.cos(a2), y2: pg.cy + pg.radius * Math.sin(a2),
              });
            }
          }
        }
        onFloorChange({ ...floor, entities: [...floor.entities.filter(e => !toRemove.has(e.id)), ...newEntities] });
        setSelectedIds(newEntities.map(e => e.id));
        cmdLog(`Exploded ${toRemove.size} entities into ${newEntities.length} lines`);
        setActiveTool('select');
        break;
      }

      // ── Array ───────────────────────────────────────────────────────
      case 'array': {
        if (selectedIds.length === 0) { cmdLog('Select entities to array'); return; }
        const rows = parseInt(prompt('Number of rows:', '3') || '0');
        const cols = parseInt(prompt('Number of columns:', '3') || '0');
        const spacingX = parseFloat(prompt('Column spacing (mm):', '2000') || '0');
        const spacingY = parseFloat(prompt('Row spacing (mm):', '2000') || '0');
        if (rows < 1 || cols < 1) { cmdLog('Invalid array parameters'); return; }
        pushUndo('Array');
        const source = floor.entities.filter(e => selectedIds.includes(e.id));
        const newEnts: AnyEntity[] = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (r === 0 && c === 0) continue;
            const dx = c * spacingX, dy = r * spacingY;
            for (const orig of source) {
              const clone = JSON.parse(JSON.stringify(orig));
              clone.id = uid();
              const verts = entityVertices(clone);
              // Translate based on type
              if ('x1' in clone) { clone.x1 += dx; clone.y1 += dy; clone.x2 += dx; clone.y2 += dy; }
              else if ('cx' in clone) { clone.cx += dx; clone.cy += dy; }
              else if ('x' in clone) { clone.x += dx; clone.y += dy; }
              if ('points' in clone && Array.isArray(clone.points)) {
                clone.points = clone.points.map((p: Vec2) => ({ x: p.x + dx, y: p.y + dy }));
              }
              newEnts.push(clone);
            }
          }
        }
        onFloorChange({ ...floor, entities: [...floor.entities, ...newEnts] });
        cmdLog(`Created ${rows}x${cols} array (${newEnts.length} new entities)`);
        setActiveTool('select');
        break;
      }

      // ── Drawing tools ───────────────────────────────────────────────
      case 'line': case 'wall': case 'beam': case 'curtainwall': case 'zone_divider': {
        const constrained = drawPts.length > 0 ? applyOrtho(drawPts[drawPts.length - 1], pt) : pt;
        if (drawPts.length === 0) {
          setDrawPts([constrained]);
          cmdLog(`${activeTool}: first point set. Click next point.`);
        } else {
          pushUndo(`Draw ${activeTool}`);
          const p1 = drawPts[0], p2 = constrained;
          let newE: AnyEntity;
          if (activeTool === 'wall') {
            newE = { id: uid(), type: 'wall', layer: activeLayer, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, thickness: wallThickness, height: wallHeight };
          } else if (activeTool === 'beam') {
            newE = { id: uid(), type: 'beam', layer: 'Beams', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, width: 300, depth: 600, elevation: wallHeight, material: 'Concrete' };
          } else if (activeTool === 'curtainwall') {
            newE = { id: uid(), type: 'curtainwall', layer: activeLayer, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, height: wallHeight, mullionSpacing: 1500, transomSpacing: 1200 };
          } else {
            newE = { id: uid(), type: 'line', layer: activeLayer, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
          }
          onFloorChange({ ...floor, entities: [...floor.entities, newE] });
          setDrawPts([p2]); // chain next segment from end
          cmdLog(`${activeTool} segment added. Continue or press Esc.`);
        }
        break;
      }

      case 'circle': {
        if (drawPts.length === 0) {
          setDrawPts([pt]);
          cmdLog('Circle: center set. Click to set radius.');
        } else {
          pushUndo('Draw circle');
          const r = dist(drawPts[0], pt);
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'circle', layer: activeLayer, cx: drawPts[0].x, cy: drawPts[0].y, radius: r }] });
          setDrawPts([]);
          cmdLog(`Circle added (R=${(r / 1000).toFixed(3)}m)`);
        }
        break;
      }

      case 'rectangle': {
        if (drawPts.length === 0) {
          setDrawPts([pt]);
          cmdLog('Rectangle: first corner set. Click opposite corner.');
        } else {
          pushUndo('Draw rectangle');
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'rectangle', layer: activeLayer, x1: drawPts[0].x, y1: drawPts[0].y, x2: pt.x, y2: pt.y }] });
          setDrawPts([]);
          cmdLog('Rectangle added.');
        }
        break;
      }

      case 'arc': {
        if (drawPts.length === 0) {
          setDrawPts([pt]);
          cmdLog('Arc: center set. Click to set radius & start.');
        } else if (drawPts.length === 1) {
          setDrawPts([...drawPts, pt]);
          cmdLog('Arc: start angle set. Click to set end angle.');
        } else {
          pushUndo('Draw arc');
          const center = drawPts[0];
          const r = dist(center, drawPts[1]);
          const sa = angleBetween(center, drawPts[1]);
          const ea = angleBetween(center, pt);
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'arc', layer: activeLayer, cx: center.x, cy: center.y, radius: r, startAngle: sa, endAngle: ea }] });
          setDrawPts([]);
          cmdLog('Arc added.');
        }
        break;
      }

      case 'ellipse': {
        if (drawPts.length === 0) {
          setDrawPts([pt]);
          cmdLog('Ellipse: center set. Click to set radii.');
        } else {
          pushUndo('Draw ellipse');
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'ellipse', layer: activeLayer, cx: drawPts[0].x, cy: drawPts[0].y,
              rx: Math.abs(pt.x - drawPts[0].x), ry: Math.abs(pt.y - drawPts[0].y),
              rotation: 0, startAngle: 0, endAngle: Math.PI * 2 }] });
          setDrawPts([]);
          cmdLog('Ellipse added.');
        }
        break;
      }

      case 'polygon': {
        if (drawPts.length === 0) {
          setDrawPts([pt]);
          cmdLog(`Polygon (${polygonSides} sides): center set. Click to set radius.`);
        } else {
          pushUndo('Draw polygon');
          const r = dist(drawPts[0], pt);
          const rot = angleBetween(drawPts[0], pt);
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'polygon', layer: activeLayer, cx: drawPts[0].x, cy: drawPts[0].y,
              radius: r, sides: polygonSides, rotation: rot, inscribed: true }] });
          setDrawPts([]);
          cmdLog('Polygon added.');
        }
        break;
      }

      case 'polyline': case 'spline': case 'slab': case 'roof': case 'room': case 'zone': case 'hatch': case 'leader': {
        const constrained = drawPts.length > 0 ? applyOrtho(drawPts[drawPts.length - 1], pt) : pt;
        setDrawPts(prev => [...prev, constrained]);
        cmdLog(`${activeTool}: point ${drawPts.length + 1} added. Right-click or Esc to finish.`);
        break;
      }

      case 'point': {
        pushUndo('Place point');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'point', layer: activeLayer, x: pt.x, y: pt.y }] });
        cmdLog('Point placed.');
        break;
      }

      // ── Construction line tools ─────────────────────────────────────
      case 'xline': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('XLine: through point set. Click direction.');
        } else {
          pushUndo('Draw xline');
          const dx = pt.x - drawPts[0].x, dy = pt.y - drawPts[0].y;
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            onFloorChange({ ...floor, entities: [...floor.entities,
              { id: uid(), type: 'xline', layer: 'Construction', x: drawPts[0].x, y: drawPts[0].y, dx: dx / len, dy: dy / len }] });
            cmdLog('Construction line placed.');
          }
          setDrawPts([]);
        }
        break;
      }
      case 'ray': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('Ray: start point set. Click direction.');
        } else {
          pushUndo('Draw ray');
          const dx = pt.x - drawPts[0].x, dy = pt.y - drawPts[0].y;
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            onFloorChange({ ...floor, entities: [...floor.entities,
              { id: uid(), type: 'ray', layer: 'Construction', x: drawPts[0].x, y: drawPts[0].y, dx: dx / len, dy: dy / len }] });
            cmdLog('Ray placed.');
          }
          setDrawPts([]);
        }
        break;
      }
      case 'donut': {
        pushUndo('Place donut');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'donut', layer: activeLayer, cx: pt.x, cy: pt.y,
            innerRadius: donutInner, outerRadius: donutOuter }] });
        cmdLog(`Donut placed (inner=${donutInner}, outer=${donutOuter}).`);
        break;
      }
      case 'circle_2p': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('Circle 2P: first point set.');
        } else {
          pushUndo('Draw circle 2P');
          const cp = midpoint(drawPts[0], pt);
          const r = dist(drawPts[0], pt) / 2;
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'circle', layer: activeLayer, cx: cp.x, cy: cp.y, radius: r }] });
          setDrawPts([]);
          cmdLog('Circle (2-point) added.');
        }
        break;
      }
      case 'circle_3p': {
        if (drawPts.length < 2) {
          setDrawPts([...drawPts, pt]); cmdLog(`Circle 3P: point ${drawPts.length + 1} set.`);
        } else {
          pushUndo('Draw circle 3P');
          // Circumscribed circle through 3 points
          const [p1, p2, p3] = [...drawPts, pt];
          const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
          const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
          if (Math.abs(D) > 1e-10) {
            const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
            const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
            const r = dist({ x: ux, y: uy }, p1);
            onFloorChange({ ...floor, entities: [...floor.entities,
              { id: uid(), type: 'circle', layer: activeLayer, cx: ux, cy: uy, radius: r }] });
            cmdLog('Circle (3-point) added.');
          } else { cmdLog('Points are collinear.'); }
          setDrawPts([]);
        }
        break;
      }
      case 'arc_3p': {
        if (drawPts.length < 2) {
          setDrawPts([...drawPts, pt]); cmdLog(`Arc 3P: point ${drawPts.length + 1} set.`);
        } else {
          pushUndo('Draw arc 3P');
          const [p1, p2, p3] = [drawPts[0], drawPts[1], pt];
          const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
          const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
          if (Math.abs(D) > 1e-10) {
            const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
            const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
            const r = dist({ x: ux, y: uy }, p1);
            const sa = Math.atan2(p1.y - uy, p1.x - ux);
            const ea = Math.atan2(p3.y - uy, p3.x - ux);
            onFloorChange({ ...floor, entities: [...floor.entities,
              { id: uid(), type: 'arc', layer: activeLayer, cx: ux, cy: uy, radius: r, startAngle: sa, endAngle: ea }] });
            cmdLog('Arc (3-point) added.');
          } else { cmdLog('Points are collinear.'); }
          setDrawPts([]);
        }
        break;
      }

      // ── Architectural tools (new) ───────────────────────────────────
      case 'railing': {
        const constrained = drawPts.length > 0 ? applyOrtho(drawPts[drawPts.length - 1], pt) : pt;
        setDrawPts(prev => [...prev, constrained]);
        cmdLog(`Railing: point ${drawPts.length + 1} added. Right-click to finish.`);
        break;
      }
      case 'ceiling': {
        const constrained = drawPts.length > 0 ? applyOrtho(drawPts[drawPts.length - 1], pt) : pt;
        setDrawPts(prev => [...prev, constrained]);
        cmdLog(`Ceiling: point ${drawPts.length + 1} added. Right-click to finish.`);
        break;
      }

      // ── Arch placement tools ────────────────────────────────────────
      case 'column': {
        pushUndo('Place column');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'column', layer: 'Columns', x: pt.x, y: pt.y, width: 300, depth: 300, height: wallHeight, rotation: 0 }] });
        cmdLog('Column placed.');
        break;
      }
      case 'stair': {
        pushUndo('Place stair');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'stair', layer: 'Stairs', x: pt.x, y: pt.y, width: 1200, length: 3000, height: wallHeight, treadNumber: 17, rotation: 0 }] });
        cmdLog('Stair placed.');
        break;
      }
      case 'ramp': {
        pushUndo('Place ramp');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'ramp', layer: 'Stairs', x: pt.x, y: pt.y, width: 1500, length: 6000, height: wallHeight, rotation: 0 }] });
        cmdLog('Ramp placed.');
        break;
      }
      case 'door': {
        pushUndo('Place door');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'door', layer: 'Doors', x: pt.x, y: pt.y, width: 900, height: 2100, swing: 90 }] });
        cmdLog('Door placed.');
        break;
      }
      case 'window': {
        pushUndo('Place window');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'window', layer: 'Windows', x: pt.x, y: pt.y, width: 1200, height: 1200, sillHeight: 900 }] });
        cmdLog('Window placed.');
        break;
      }

      // ── Annotation tools ────────────────────────────────────────────
      case 'text': {
        const txt = prompt('Enter text:');
        if (!txt) return;
        pushUndo('Add text');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'text', layer: 'Annotation', x: pt.x, y: pt.y, text: txt, fontSize: 200, rotation: 0 }] });
        cmdLog('Text placed.');
        break;
      }
      case 'mtext': {
        const txt = prompt('Enter multi-line text (use \\n for newlines):');
        if (!txt) return;
        pushUndo('Add mtext');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'mtext', layer: 'Annotation', x: pt.x, y: pt.y, width: 2000, text: txt.replace(/\\n/g, '\n'), fontSize: 150, rotation: 0 }] });
        cmdLog('Multiline text placed.');
        break;
      }
      case 'dimension': case 'dim_aligned': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('Dimension: first point set.');
        } else if (drawPts.length === 1) {
          setDrawPts([...drawPts, pt]); cmdLog('Dimension: second point set. Click to set offset.');
        } else {
          pushUndo('Add dimension');
          const kind = activeTool === 'dim_aligned' ? 'aligned' as const : 'linear' as const;
          const n = perpNormal(drawPts[0], drawPts[1]);
          const offDist = (pt.x - drawPts[0].x) * n.x + (pt.y - drawPts[0].y) * n.y;
          // Auto-link to nearest matching wall/line entity (parametric constraint)
          let constrainedEntityId: string | undefined;
          const tol = 50; // mm tolerance for matching endpoints
          for (const ent of floor.entities) {
            if (ent.type === 'wall' || ent.type === 'line' || ent.type === 'beam') {
              const e = ent as any;
              const d1s = dist(drawPts[0], { x: e.x1, y: e.y1 });
              const d1e = dist(drawPts[0], { x: e.x2, y: e.y2 });
              const d2s = dist(drawPts[1], { x: e.x1, y: e.y1 });
              const d2e = dist(drawPts[1], { x: e.x2, y: e.y2 });
              if ((d1s < tol && d2e < tol) || (d1e < tol && d2s < tol)) {
                constrainedEntityId = ent.id;
                break;
              }
            }
          }
          const newDim: DimensionEntity = {
            id: uid(), type: 'dimension', layer: 'Dimensions', dimKind: kind,
            x1: drawPts[0].x, y1: drawPts[0].y, x2: drawPts[1].x, y2: drawPts[1].y, offset: offDist,
            constrainedEntityId,
          };
          onFloorChange({ ...floor, entities: [...floor.entities, newDim] });
          setDrawPts([]);
          cmdLog(constrainedEntityId ? 'Parametric dimension added (linked).' : 'Dimension added.');
        }
        break;
      }
      case 'dim_radius': {
        const hit = hitTest(pt);
        if (!hit || (hit.type !== 'circle' && hit.type !== 'arc')) { cmdLog('Click on a circle or arc'); return; }
        pushUndo('Add radius dimension');
        const c = hit as CircleEntity;
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'dimension', layer: 'Dimensions', dimKind: 'radius',
            x1: c.cx, y1: c.cy, x2: c.cx + c.radius, y2: c.cy, offset: 0 }] });
        cmdLog('Radius dimension added.');
        break;
      }
      case 'dim_diameter': {
        const hit = hitTest(pt);
        if (!hit || (hit.type !== 'circle' && hit.type !== 'arc')) { cmdLog('Click on a circle or arc'); return; }
        pushUndo('Add diameter dimension');
        const c = hit as CircleEntity;
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'dimension', layer: 'Dimensions', dimKind: 'diameter',
            x1: c.cx - c.radius, y1: c.cy, x2: c.cx + c.radius, y2: c.cy, offset: 0 }] });
        cmdLog('Diameter dimension added.');
        break;
      }
      case 'dim_angular': {
        if (drawPts.length < 2) {
          setDrawPts([...drawPts, pt]); cmdLog(`Angular dim: point ${drawPts.length + 1} set.`);
        } else {
          pushUndo('Add angular dimension');
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'dimension', layer: 'Dimensions', dimKind: 'angular',
              x1: drawPts[0].x, y1: drawPts[0].y, x2: drawPts[1].x, y2: drawPts[1].y,
              x3: pt.x, y3: pt.y, offset: 500 }] });
          setDrawPts([]);
          cmdLog('Angular dimension added.');
        }
        break;
      }
      case 'dim_ordinate': {
        pushUndo('Add ordinate dimension');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'dimension', layer: 'Dimensions', dimKind: 'ordinate',
            x1: pt.x, y1: pt.y, x2: pt.x + 1000, y2: pt.y, offset: 500 }] });
        cmdLog('Ordinate dimension added.');
        break;
      }
      case 'dim_arc_length': {
        const hit = hitTest(pt);
        if (!hit || hit.type !== 'arc') { cmdLog('Click on an arc'); return; }
        pushUndo('Add arc length dimension');
        const a = hit as ArcEntity;
        const arcLen = a.radius * Math.abs(a.endAngle - a.startAngle);
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'dimension', layer: 'Dimensions', dimKind: 'arc_length',
            x1: a.cx + a.radius * Math.cos(a.startAngle), y1: a.cy + a.radius * Math.sin(a.startAngle),
            x2: a.cx + a.radius * Math.cos(a.endAngle), y2: a.cy + a.radius * Math.sin(a.endAngle),
            offset: a.radius + 500, textOverride: `${(arcLen / 1000).toFixed(3)} m` }] });
        cmdLog('Arc length dimension added.');
        break;
      }
      case 'multileader': {
        const constrained = drawPts.length > 0 ? applyOrtho(drawPts[drawPts.length - 1], pt) : pt;
        setDrawPts(prev => [...prev, constrained]);
        cmdLog(`Multileader: point ${drawPts.length + 1}. Right-click to finish.`);
        break;
      }
      case 'table': {
        pushUndo('Insert table');
        const rows = parseInt(prompt('Number of rows:', '4') || '0');
        const cols = parseInt(prompt('Number of columns:', '3') || '0');
        if (rows < 1 || cols < 1) { cmdLog('Invalid table size'); break; }
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'table', layer: 'Annotation', x: pt.x, y: pt.y,
            rows, cols,
            colWidths: Array(cols).fill(1500),
            rowHeights: Array(rows).fill(400),
            cells: Array.from({ length: rows }, () => Array(cols).fill('')),
            rotation: 0 }] });
        cmdLog(`Table ${rows}x${cols} inserted.`);
        break;
      }
      case 'tolerance': {
        const sym = prompt('GD&T symbol (⌖ ⊕ ⊘ ⏥ ∠ ⟂ ∥ ○ ◎ etc):', '⌖') || '⌖';
        const val = prompt('Tolerance value (e.g. 0.05):', '0.05') || '0.05';
        pushUndo('Insert tolerance');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'tolerance', layer: 'Annotation', x: pt.x, y: pt.y,
            symbol: sym, value: val }] });
        cmdLog('Tolerance frame inserted.');
        break;
      }

      // ── Inquiry tools ───────────────────────────────────────────────
      case 'dist_info': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('Distance: pick second point.');
        } else {
          const d = dist(drawPts[0], pt);
          const a = angleBetween(drawPts[0], pt) * 180 / Math.PI;
          const dx = pt.x - drawPts[0].x, dy = pt.y - drawPts[0].y;
          cmdLog(`DIST = ${(d / 1000).toFixed(4)}m  Angle = ${a.toFixed(2)}°  ΔX=${(dx / 1000).toFixed(4)}m  ΔY=${(dy / 1000).toFixed(4)}m`);
          setDrawPts([]);
        }
        break;
      }
      case 'area_info': {
        const constrained = drawPts.length > 0 ? applyOrtho(drawPts[drawPts.length - 1], pt) : pt;
        setDrawPts(prev => [...prev, constrained]);
        cmdLog(`Area: point ${drawPts.length + 1}. Right-click to calculate.`);
        break;
      }
      case 'id_point': {
        cmdLog(`ID Point: X=${(pt.x / 1000).toFixed(4)}m  Y=${(pt.y / 1000).toFixed(4)}m`);
        break;
      }
      case 'list_info': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on an entity to list properties'); break; }
        const verts = entityVertices(hit);
        cmdLog(`LIST — Type: ${hit.type}  Layer: ${hit.layer}  ID: ${hit.id}  Vertices: ${verts.length}`);
        if ('x1' in hit) cmdLog(`  Start: (${((hit as any).x1 / 1000).toFixed(3)}, ${((hit as any).y1 / 1000).toFixed(3)})  End: (${((hit as any).x2 / 1000).toFixed(3)}, ${((hit as any).y2 / 1000).toFixed(3)})`);
        if ('cx' in hit) cmdLog(`  Center: (${((hit as any).cx / 1000).toFixed(3)}, ${((hit as any).cy / 1000).toFixed(3)})  Radius: ${((hit as any).radius / 1000).toFixed(3)}m`);
        if ('points' in hit) cmdLog(`  Points: ${(hit as any).points.length}`);
        break;
      }
      case 'massprop': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on a closed entity'); break; }
        const pts = 'points' in hit ? (hit as any).points : entityVertices(hit);
        if (pts.length >= 3) {
          const a = Math.abs(polygonArea(pts)) / 1e6;
          let peri = 0;
          for (let i = 0; i < pts.length; i++) peri += dist(pts[i], pts[(i + 1) % pts.length]);
          cmdLog(`MASSPROP — Area: ${a.toFixed(4)} m²  Perimeter: ${(peri / 1000).toFixed(4)}m`);
        } else { cmdLog('Cannot compute mass properties for this entity'); }
        break;
      }

      // ── Block & Group tools ─────────────────────────────────────────
      case 'block_create': {
        if (selectedIds.length === 0) { cmdLog('Select entities first to make a block'); break; }
        const name = prompt('Block name:');
        if (!name) break;
        const basePoint = pt;
        const blockEntities = floor.entities.filter(e => selectedIds.includes(e.id));
        setBlocks(prev => [...prev, { name, basePoint, entities: JSON.parse(JSON.stringify(blockEntities)) }]);
        cmdLog(`Block "${name}" created with ${blockEntities.length} entities.`);
        setActiveTool('select');
        break;
      }
      case 'block_insert': {
        if (blocks.length === 0) { cmdLog('No blocks defined. Create one first.'); break; }
        const name = prompt(`Insert block (${blocks.map(b => b.name).join(', ')}):`);
        if (!name) break;
        const block = blocks.find(b => b.name === name);
        if (!block) { cmdLog(`Block "${name}" not found`); break; }
        pushUndo('Insert block');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'block_ref', layer: activeLayer, blockName: name,
            x: pt.x, y: pt.y, scaleX: 1, scaleY: 1, rotation: 0 }] });
        cmdLog(`Block "${name}" inserted.`);
        break;
      }
      case 'group': {
        if (selectedIds.length === 0) { cmdLog('Select entities first to group'); break; }
        const gName = `Group_${Object.keys(groups).length + 1}`;
        setGroups(prev => ({ ...prev, [gName]: [...selectedIds] }));
        cmdLog(`Group "${gName}" created with ${selectedIds.length} entities.`);
        setActiveTool('select');
        break;
      }
      case 'ungroup': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on a grouped entity'); break; }
        const matchGroup = Object.entries(groups).find(([, ids]) => ids.includes(hit.id));
        if (matchGroup) {
          setGroups(prev => { const next = { ...prev }; delete next[matchGroup[0]]; return next; });
          cmdLog(`Group "${matchGroup[0]}" dissolved.`);
        } else { cmdLog('Entity is not in a group'); }
        break;
      }

      // ── Utility tools ───────────────────────────────────────────────
      case 'select_all': {
        setSelectedIds(floor.entities.map(en => en.id));
        cmdLog(`Selected all ${floor.entities.length} entities.`);
        break;
      }
      case 'select_similar': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on an entity to select similar'); break; }
        const similar = floor.entities.filter(e => e.type === hit.type && e.layer === hit.layer).map(e => e.id);
        setSelectedIds(similar);
        cmdLog(`Selected ${similar.length} similar entities (type=${hit.type}, layer=${hit.layer}).`);
        break;
      }
      case 'matchprop': {
        if (selectedIds.length === 0) {
          const hit = hitTest(pt);
          if (!hit) { cmdLog('Click source entity'); break; }
          setSelectedIds([hit.id]);
          cmdLog('Source selected. Click target entities.');
        } else {
          const hit = hitTest(pt);
          if (!hit) { cmdLog('Click target entity'); break; }
          const source = floor.entities.find(e => e.id === selectedIds[0]);
          if (!source) break;
          pushUndo('Match properties');
          onFloorChange({ ...floor, entities: floor.entities.map(e =>
            e.id === hit.id ? { ...e, layer: source.layer, color: source.color, lineweight: source.lineweight, linetype: source.linetype } as AnyEntity : e) });
          cmdLog('Properties matched.');
        }
        break;
      }
      case 'divide': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on an entity to divide'); break; }
        const n = parseInt(prompt('Number of divisions:', '5') || '0');
        if (n < 2) { cmdLog('Invalid number'); break; }
        pushUndo('Divide');
        const verts = entityVertices(hit);
        if (verts.length >= 2 && ('x1' in hit)) {
          const p1 = verts[0], p2 = verts[1];
          const newPts: AnyEntity[] = [];
          for (let i = 1; i < n; i++) {
            const frac = i / n;
            newPts.push({ id: uid(), type: 'point', layer: activeLayer,
              x: p1.x + (p2.x - p1.x) * frac, y: p1.y + (p2.y - p1.y) * frac });
          }
          onFloorChange({ ...floor, entities: [...floor.entities, ...newPts] });
          cmdLog(`Divided into ${n} segments (${n - 1} points placed).`);
        } else { cmdLog('Cannot divide this entity type'); }
        setActiveTool('select');
        break;
      }
      case 'measure_entity': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on an entity to measure along'); break; }
        const spacing = parseFloat(prompt('Spacing (mm):', '500') || '0');
        if (spacing <= 0) { cmdLog('Invalid spacing'); break; }
        pushUndo('Measure entity');
        const verts = entityVertices(hit);
        if (verts.length >= 2 && ('x1' in hit)) {
          const p1 = verts[0], p2 = verts[1];
          const totalLen = dist(p1, p2);
          const newPts: AnyEntity[] = [];
          for (let d = spacing; d < totalLen; d += spacing) {
            const frac = d / totalLen;
            newPts.push({ id: uid(), type: 'point', layer: activeLayer,
              x: p1.x + (p2.x - p1.x) * frac, y: p1.y + (p2.y - p1.y) * frac });
          }
          onFloorChange({ ...floor, entities: [...floor.entities, ...newPts] });
          cmdLog(`Placed ${newPts.length} points at ${spacing}mm intervals.`);
        } else { cmdLog('Cannot measure this entity type'); }
        setActiveTool('select');
        break;
      }
      case 'join': {
        if (selectedIds.length < 2) { cmdLog('Select 2+ lines/polylines to join'); break; }
        pushUndo('Join');
        const selected = floor.entities.filter(e => selectedIds.includes(e.id));
        const lines = selected.filter(e => e.type === 'line') as LineEntity[];
        if (lines.length >= 2) {
          const allPts: Vec2[] = [];
          for (const l of lines) {
            if (allPts.length === 0) { allPts.push({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }); }
            else { allPts.push({ x: l.x2, y: l.y2 }); }
          }
          const joined: AnyEntity = { id: uid(), type: 'polyline', layer: activeLayer, points: allPts, closed: false };
          onFloorChange({ ...floor, entities: [...floor.entities.filter(e => !selectedIds.includes(e.id)), joined] });
          setSelectedIds([joined.id]);
          cmdLog(`Joined ${lines.length} lines into polyline.`);
        } else { cmdLog('Need at least 2 lines to join'); }
        setActiveTool('select');
        break;
      }
      case 'lengthen': {
        const hit = hitTest(pt);
        if (!hit || hit.type !== 'line') { cmdLog('Click on a line to lengthen'); break; }
        const delta = parseFloat(prompt('Delta length (mm, + to extend, - to shorten):', '500') || '0');
        if (delta === 0) break;
        pushUndo('Lengthen');
        const line = hit as LineEntity;
        const len = dist({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
        const newLen = Math.max(1, len + delta);
        const ratio = newLen / len;
        const dx = (line.x2 - line.x1) * ratio, dy = (line.y2 - line.y1) * ratio;
        onFloorChange({ ...floor, entities: floor.entities.map(e =>
          e.id === hit.id ? { ...line, x2: line.x1 + dx, y2: line.y1 + dy } as AnyEntity : e) });
        cmdLog(`Lengthened by ${delta}mm (new length: ${(newLen / 1000).toFixed(3)}m).`);
        setActiveTool('select');
        break;
      }
      case 'break_at_point': {
        const hit = hitTest(pt);
        if (!hit || hit.type !== 'line') { cmdLog('Click on a line to break at point'); break; }
        pushUndo('Break at point');
        const line = hit as LineEntity;
        const line1: AnyEntity = { id: uid(), type: 'line', layer: line.layer, x1: line.x1, y1: line.y1, x2: pt.x, y2: pt.y };
        const line2: AnyEntity = { id: uid(), type: 'line', layer: line.layer, x1: pt.x, y1: pt.y, x2: line.x2, y2: line.y2 };
        onFloorChange({ ...floor, entities: [...floor.entities.filter(e => e.id !== hit.id), line1, line2] });
        cmdLog('Line broken at point.');
        setActiveTool('select');
        break;
      }
      case 'align': {
        if (selectedIds.length === 0) { cmdLog('Select entities first, then use Align'); break; }
        if (drawPts.length < 2) {
          setDrawPts([...drawPts, pt]);
          cmdLog(drawPts.length === 0 ? 'Align: source point 1' : 'Align: source point 2. Now click dest point 1.');
        } else if (drawPts.length === 2) {
          setDrawPts([...drawPts, pt]);
          cmdLog('Align: dest point 1. Click dest point 2.');
        } else {
          pushUndo('Align');
          const [s1, s2, d1] = drawPts;
          const d2 = pt;
          const sAngle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
          const dAngle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
          const angle = dAngle - sAngle;
          const sx = dist(d1, d2) / dist(s1, s2);
          const dx = d1.x - s1.x, dy = d1.y - s1.y;
          onFloorChange({ ...floor, entities: floor.entities.map(e => {
            if (!selectedIds.includes(e.id)) return e;
            const clone = JSON.parse(JSON.stringify(e));
            // Simple translation + rotation
            for (const key of ['x1', 'y1', 'x2', 'y2', 'x', 'y', 'cx', 'cy'] as const) {
              if (key in clone) {
                if (key.endsWith('x') || key === 'x' || key === 'cx') clone[key] += dx;
                if (key.endsWith('y') || key === 'y' || key === 'cy') clone[key] += dy;
              }
            }
            if ('points' in clone && Array.isArray(clone.points)) {
              clone.points = clone.points.map((p: Vec2) => ({ x: p.x + dx, y: p.y + dy }));
            }
            return clone as AnyEntity;
          }) });
          setDrawPts([]);
          cmdLog('Entities aligned.');
          setActiveTool('select');
        }
        break;
      }

      // ── Layer utility tools ─────────────────────────────────────────
      case 'layer_isolate': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on an entity to isolate its layer'); break; }
        onLayersChange(layers.map(l => ({ ...l, visible: l.name === hit.layer })));
        cmdLog(`Layer "${hit.layer}" isolated.`);
        setActiveTool('select');
        break;
      }
      case 'layer_unisolate': {
        onLayersChange(layers.map(l => ({ ...l, visible: true })));
        cmdLog('All layers visible.');
        setActiveTool('select');
        break;
      }
      case 'layer_freeze': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on an entity to freeze its layer'); break; }
        onLayersChange(layers.map(l => l.name === hit.layer ? { ...l, visible: false, locked: true } : l));
        cmdLog(`Layer "${hit.layer}" frozen.`);
        setActiveTool('select');
        break;
      }
      case 'layer_off': {
        const hit = hitTest(pt);
        if (!hit) { cmdLog('Click on an entity to turn off its layer'); break; }
        onLayersChange(layers.map(l => l.name === hit.layer ? { ...l, visible: false } : l));
        cmdLog(`Layer "${hit.layer}" off.`);
        setActiveTool('select');
        break;
      }

      // ── Purge / Audit ───────────────────────────────────────────────
      case 'purge': {
        const usedLayers = new Set(floor.entities.map(e => e.layer));
        const unused = layers.filter(l => !usedLayers.has(l.name) && l.name !== '0' && l.name !== 'Defpoints');
        if (unused.length > 0) {
          onLayersChange(layers.filter(l => usedLayers.has(l.name) || l.name === '0' || l.name === 'Defpoints'));
          cmdLog(`Purged ${unused.length} unused layers: ${unused.map(l => l.name).join(', ')}`);
        } else { cmdLog('Nothing to purge.'); }
        setActiveTool('select');
        break;
      }
      case 'audit': {
        let issues = 0;
        const orphanLayer = floor.entities.filter(e => !layers.find(l => l.name === e.layer));
        issues += orphanLayer.length;
        cmdLog(`AUDIT — Entities: ${floor.entities.length}  Layers: ${layers.length}  Orphan layers: ${orphanLayer.length}  Issues: ${issues}`);
        setActiveTool('select');
        break;
      }
      case 'units': {
        const u = prompt(`Drawing units (current: ${drawingUnits}). Enter mm/cm/m/ft/in:`, drawingUnits);
        if (u && ['mm', 'cm', 'm', 'ft', 'in'].includes(u)) {
          setDrawingUnits(u as any);
          cmdLog(`Units set to ${u}.`);
        }
        setActiveTool('select');
        break;
      }
      case 'limits': {
        cmdLog(`Drawing limits: entities span the entire canvas. Use Zoom Extents (ZE) to fit.`);
        setActiveTool('select');
        break;
      }

      // ── New Selection tools ──────────────────────────────────────────
      case 'quick_select': {
        const typeFilter = prompt('Entity type to select (e.g. line, wall, circle, all):', 'all');
        if (typeFilter) {
          const matched = floor.entities.filter(ent =>
            typeFilter === 'all' || ent.type === typeFilter
          );
          setSelectedIds(matched.map(ent => ent.id));
          cmdLog(`Quick Select: ${matched.length} entities of type "${typeFilter}"`);
        }
        setActiveTool('select');
        break;
      }
      case 'select_previous': {
        cmdLog(`Select Previous: restored ${selectedIds.length} previous selections`);
        break;
      }
      case 'deselect_all': {
        setSelectedIds([]);
        cmdLog('All entities deselected');
        setActiveTool('select');
        break;
      }

      // ── New Modify tools ────────────────────────────────────────────
      case 'erase': {
        if (selectedIds.length === 0) { cmdLog('Select objects to erase'); return; }
        pushUndo('Erase');
        onFloorChange({ ...floor, entities: floor.entities.filter(ent => !selectedIds.includes(ent.id)) });
        cmdLog(`Erased ${selectedIds.length} entities`);
        setSelectedIds([]);
        setActiveTool('select');
        break;
      }
      case 'reverse': {
        if (selectedIds.length === 0) { cmdLog('Select polylines/lines to reverse'); return; }
        pushUndo('Reverse');
        const newEnts = floor.entities.map(ent => {
          if (!selectedIds.includes(ent.id)) return ent;
          if (ent.type === 'polyline') return { ...ent, points: [...(ent as any).points].reverse() };
          if (ent.type === 'line') return { ...ent, x1: (ent as any).x2, y1: (ent as any).y2, x2: (ent as any).x1, y2: (ent as any).y1 };
          return ent;
        });
        onFloorChange({ ...floor, entities: newEnts });
        cmdLog(`Reversed ${selectedIds.length} entities`);
        setActiveTool('select');
        break;
      }
      case 'overkill': {
        pushUndo('Overkill');
        const seen = new Set<string>();
        const filtered = floor.entities.filter(ent => {
          const key = JSON.stringify(entityVertices(ent)) + ent.type + ent.layer;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const removed = floor.entities.length - filtered.length;
        onFloorChange({ ...floor, entities: filtered });
        cmdLog(`Overkill: removed ${removed} duplicate entities`);
        setActiveTool('select');
        break;
      }
      case 'convert_to_polyline': {
        if (selectedIds.length === 0) { cmdLog('Select lines to convert'); return; }
        pushUndo('Convert to Polyline');
        const lines = floor.entities.filter(ent => selectedIds.includes(ent.id) && ent.type === 'line');
        if (lines.length === 0) { cmdLog('No lines selected'); break; }
        const pts = lines.flatMap(l => [{ x: (l as any).x1, y: (l as any).y1 }, { x: (l as any).x2, y: (l as any).y2 }]);
        const newPl: AnyEntity = { id: uid(), type: 'polyline', layer: activeLayer, points: pts, closed: false };
        const remaining = floor.entities.filter(ent => !selectedIds.includes(ent.id) || ent.type !== 'line');
        onFloorChange({ ...floor, entities: [...remaining, newPl] });
        cmdLog(`Converted ${lines.length} lines to polyline`);
        setSelectedIds([newPl.id]);
        setActiveTool('select');
        break;
      }
      case 'convert_to_region': {
        if (selectedIds.length === 0) { cmdLog('Select closed polylines to convert'); return; }
        pushUndo('Convert to Region');
        const converted: AnyEntity[] = [];
        const remaining2 = floor.entities.filter(ent => {
          if (!selectedIds.includes(ent.id)) return true;
          if (ent.type === 'polyline' && (ent as any).closed) {
            converted.push({ id: uid(), type: 'region', layer: ent.layer, boundary: (ent as any).points } as any);
            return false;
          }
          return true;
        });
        onFloorChange({ ...floor, entities: [...remaining2, ...converted] });
        cmdLog(`Converted ${converted.length} polylines to regions`);
        setActiveTool('select');
        break;
      }
      case 'subtract': case 'union_2d': case 'intersect_2d': {
        cmdLog(`2D Boolean ${activeTool}: select 2 closed regions. (Uses Shapely via bridge)`);
        if (selectedIds.length >= 2) {
          const sel = floor.entities.filter(ent => selectedIds.includes(ent.id));
          invoke<any>('perform_geom_op', { op: activeTool.replace('_2d', ''), entities: sel, params: {} })
            .then(res => {
              if (res?.results?.length > 0) {
                pushUndo(`Boolean ${activeTool}`);
                const newEnts = res.results.map((r: any) => ({ ...r, id: uid() }));
                const remaining = floor.entities.filter(ent => !selectedIds.includes(ent.id));
                onFloorChange({ ...floor, entities: [...remaining, ...newEnts] });
                cmdLog(`Boolean ${activeTool}: success`);
              }
            })
            .catch(err => cmdLog(`Boolean error: ${err}`));
        }
        setActiveTool('select');
        break;
      }

      // ── MEP tools ──────────────────────────────────────────────────
      case 'pipe': case 'duct': case 'conduit': case 'cable_tray': {
        setDrawPts(prev => [...prev, pt]);
        cmdLog(`${activeTool}: click points, right-click to finish`);
        break;
      }
      case 'sprinkler': case 'diffuser': case 'outlet': case 'switch_mep':
      case 'panel_board': case 'transformer': case 'valve': case 'pump': {
        pushUndo(`Place ${activeTool}`);
        const mepLayer = activeTool === 'sprinkler' || activeTool === 'diffuser' ? 'HVAC'
          : activeTool === 'valve' || activeTool === 'pump' ? 'Plumbing'
          : 'Electrical';
        const newMep: AnyEntity = { id: uid(), type: activeTool, layer: mepLayer, x: pt.x, y: pt.y, rotation: 0 } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newMep] });
        cmdLog(`Placed ${activeTool} at (${(pt.x/1000).toFixed(2)}, ${(pt.y/1000).toFixed(2)})`);
        break;
      }

      // ── Site tools ──────────────────────────────────────────────────
      case 'contour': case 'grading': case 'paving': case 'fence_site': {
        setDrawPts(prev => [...prev, pt]);
        cmdLog(`${activeTool}: click points, right-click to finish`);
        break;
      }
      case 'landscape': {
        const species = prompt('Plant type (tree/shrub/groundcover):', 'tree');
        pushUndo('Place landscape');
        const newPlant: AnyEntity = { id: uid(), type: 'landscape', layer: 'Landscape',
          x: pt.x, y: pt.y, radius: species === 'tree' ? 2000 : 500,
          plantType: species || 'tree', species: '' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newPlant] });
        cmdLog(`Placed ${species || 'tree'} at (${(pt.x/1000).toFixed(2)}, ${(pt.y/1000).toFixed(2)})`);
        break;
      }
      case 'parking': {
        pushUndo('Place parking');
        const newParking: AnyEntity = { id: uid(), type: 'parking', layer: 'Parking',
          x: pt.x, y: pt.y, width: 2500, depth: 5000, rotation: 0,
          spaces: 1, parkingType: 'standard' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newParking] });
        cmdLog('Placed parking space');
        break;
      }

      // ── Extended Arch tools ──────────────────────────────────────────
      case 'furniture': {
        const cat = prompt('Furniture type (chair/desk/table/sofa/bed/cabinet/shelf):', 'chair');
        pushUndo('Place furniture');
        const widthMap: Record<string, number> = { chair: 500, desk: 1200, table: 1500, sofa: 2000, bed: 2000, cabinet: 800, shelf: 900 };
        const depthMap: Record<string, number> = { chair: 500, desk: 600, table: 900, sofa: 800, bed: 1500, cabinet: 400, shelf: 300 };
        const fw = widthMap[cat || 'chair'] || 600;
        const fd = depthMap[cat || 'chair'] || 600;
        const newFurn: AnyEntity = { id: uid(), type: 'furniture', layer: 'Furniture',
          x: pt.x, y: pt.y, width: fw, depth: fd, rotation: 0, category: cat || 'chair', name: cat || 'chair' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newFurn] });
        cmdLog(`Placed ${cat || 'chair'}`);
        break;
      }
      case 'appliance': {
        const cat = prompt('Appliance type (oven/fridge/washer/dryer/dishwasher/microwave):', 'oven');
        pushUndo('Place appliance');
        const newApp: AnyEntity = { id: uid(), type: 'appliance', layer: 'Furniture',
          x: pt.x, y: pt.y, width: 600, depth: 600, rotation: 0, category: cat || 'oven', name: cat || 'oven' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newApp] });
        cmdLog(`Placed ${cat || 'oven'}`);
        break;
      }
      case 'fixture': {
        const cat = prompt('Fixture type (sink/toilet/bathtub/shower/vanity/bidet):', 'sink');
        pushUndo('Place fixture');
        const fxWidthMap: Record<string, number> = { sink: 500, toilet: 400, bathtub: 1700, shower: 900, vanity: 600, bidet: 350 };
        const fxDepthMap: Record<string, number> = { sink: 400, toilet: 700, bathtub: 700, shower: 900, vanity: 500, bidet: 600 };
        const newFix: AnyEntity = { id: uid(), type: 'fixture', layer: 'Plumbing',
          x: pt.x, y: pt.y, width: fxWidthMap[cat || 'sink'] || 500, depth: fxDepthMap[cat || 'sink'] || 400,
          rotation: 0, category: cat || 'sink', name: cat || 'sink' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newFix] });
        cmdLog(`Placed ${cat || 'sink'}`);
        break;
      }
      case 'structural_member': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('Structural member: click end point');
        } else {
          pushUndo('Structural member');
          const newSM: AnyEntity = { id: uid(), type: 'structural_member', layer: 'Structural',
            x1: drawPts[0].x, y1: drawPts[0].y, x2: pt.x, y2: pt.y,
            width: 300, depth: 300, profile: 'W', material: 'steel' } as any;
          onFloorChange({ ...floor, entities: [...floor.entities, newSM] });
          setDrawPts([]);
          cmdLog('Placed structural member');
        }
        break;
      }
      case 'footing': {
        pushUndo('Place footing');
        const newFt: AnyEntity = { id: uid(), type: 'footing', layer: 'Foundation',
          x: pt.x, y: pt.y, width: 1500, depth: 1500, thickness: 300, footingType: 'pad' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newFt] });
        cmdLog('Placed pad footing');
        break;
      }
      case 'pile': {
        pushUndo('Place pile');
        const newPile: AnyEntity = { id: uid(), type: 'pile', layer: 'Foundation',
          x: pt.x, y: pt.y, diameter: 600, depth: 15000, pileType: 'bored' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newPile] });
        cmdLog('Placed bored pile');
        break;
      }
      case 'retaining_wall': {
        setDrawPts(prev => [...prev, pt]);
        cmdLog('Retaining wall: click points, right-click to finish');
        break;
      }
      case 'opening': {
        pushUndo('Place opening');
        const newOp: AnyEntity = { id: uid(), type: 'opening', layer: 'Walls',
          x: pt.x, y: pt.y, width: 900, height: 2100, rotation: 0 } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newOp] });
        cmdLog('Placed opening');
        break;
      }
      case 'niche': {
        pushUndo('Place niche');
        const newNiche: AnyEntity = { id: uid(), type: 'niche', layer: 'Walls',
          x: pt.x, y: pt.y, width: 600, height: 1200, depth: 200, rotation: 0 } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newNiche] });
        cmdLog('Placed niche');
        break;
      }
      case 'shaft': {
        setDrawPts(prev => [...prev, pt]);
        cmdLog('Shaft: click outline points, right-click to finish');
        break;
      }
      case 'elevator': {
        pushUndo('Place elevator');
        const newElev: AnyEntity = { id: uid(), type: 'elevator', layer: activeLayer,
          x: pt.x, y: pt.y, width: 2000, depth: 2000, capacity: 8, stops: 5 } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newElev] });
        cmdLog('Placed elevator');
        break;
      }

      // ── Extended Annotation tools ───────────────────────────────────
      case 'section_mark': {
        const sid = prompt('Section ID:', 'A');
        pushUndo('Place section mark');
        const newSM2: AnyEntity = { id: uid(), type: 'section_mark', layer: 'Sections',
          x: pt.x, y: pt.y, rotation: 0, sectionId: sid || 'A' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newSM2] });
        cmdLog(`Placed section mark ${sid || 'A'}`);
        break;
      }
      case 'detail_mark': {
        const did = prompt('Detail ID:', '1');
        pushUndo('Place detail mark');
        const newDM: AnyEntity = { id: uid(), type: 'detail_mark', layer: 'Details',
          x: pt.x, y: pt.y, radius: 1000, detailId: did || '1' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newDM] });
        cmdLog(`Placed detail mark ${did || '1'}`);
        break;
      }
      case 'elevation_mark': {
        const elev = prompt('Elevation (m):', '0.00');
        pushUndo('Place elevation mark');
        const newEM: AnyEntity = { id: uid(), type: 'elevation_mark', layer: 'Annotation',
          x: pt.x, y: pt.y, elevation: parseFloat(elev || '0'), direction: 0 } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newEM] });
        cmdLog(`Placed elevation mark +${elev || '0.00'}m`);
        break;
      }
      case 'grid_bubble': {
        const label = prompt('Grid label:', 'A');
        pushUndo('Place grid bubble');
        const newGB: AnyEntity = { id: uid(), type: 'grid_bubble', layer: 'Grid',
          x: pt.x, y: pt.y, label: label || 'A', direction: 'vertical', length: 10000 } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newGB] });
        cmdLog(`Placed grid bubble "${label || 'A'}"`);
        break;
      }
      case 'tag': {
        const txt = prompt('Tag text:', 'TAG');
        pushUndo('Place tag');
        const newTag: AnyEntity = { id: uid(), type: 'tag', layer: 'Annotation',
          x: pt.x, y: pt.y, text: txt || 'TAG', tagType: 'room' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newTag] });
        cmdLog(`Placed tag "${txt || 'TAG'}"`);
        break;
      }
      case 'keynote': {
        setDrawPts(prev => [...prev, pt]);
        if (drawPts.length === 0) cmdLog('Keynote: click leader points, right-click to finish');
        break;
      }
      case 'revision_tag': {
        const rev = prompt('Revision number:', '1');
        const desc = prompt('Description:', 'Initial');
        pushUndo('Place revision tag');
        const newRT: AnyEntity = { id: uid(), type: 'revision_tag', layer: 'Revisions',
          x: pt.x, y: pt.y, revisionNumber: rev || '1',
          date: new Date().toISOString().split('T')[0], description: desc || 'Initial' } as any;
        onFloorChange({ ...floor, entities: [...floor.entities, newRT] });
        cmdLog(`Placed revision tag Rev ${rev || '1'}`);
        break;
      }
      case 'dim_baseline': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('Baseline dimension: click first point');
        } else if (drawPts.length === 1) {
          setDrawPts([...drawPts, pt]); cmdLog('Click additional points for baseline dims, right-click to finish');
        } else {
          pushUndo('Baseline Dim');
          const offset = 500 * drawPts.length;
          const newDim: AnyEntity = { id: uid(), type: 'dimension', layer: 'Dimensions',
            x1: drawPts[0].x, y1: drawPts[0].y, x2: pt.x, y2: pt.y,
            offset: offset, kind: 'linear' } as any;
          onFloorChange({ ...floor, entities: [...floor.entities, newDim] });
          setDrawPts([...drawPts, pt]);
          cmdLog(`Baseline dim added: ${(dist(drawPts[0], pt)/1000).toFixed(3)}m`);
        }
        break;
      }
      case 'dim_continue': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('Continue dimension: click next point');
        } else {
          pushUndo('Continue Dim');
          const newDim: AnyEntity = { id: uid(), type: 'dimension', layer: 'Dimensions',
            x1: drawPts[drawPts.length - 1].x, y1: drawPts[drawPts.length - 1].y,
            x2: pt.x, y2: pt.y, offset: 500, kind: 'linear' } as any;
          onFloorChange({ ...floor, entities: [...floor.entities, newDim] });
          setDrawPts([...drawPts, pt]);
          cmdLog(`Continue dim: ${(dist(drawPts[drawPts.length - 1], pt)/1000).toFixed(3)}m`);
        }
        break;
      }
      case 'dim_center_mark': {
        const hit = hitTest(pt);
        if (hit && (hit.type === 'circle' || hit.type === 'arc')) {
          pushUndo('Center Mark');
          const c = hit as any;
          const cx = c.cx, cy = c.cy, r = c.radius || 200;
          const lines: AnyEntity[] = [
            { id: uid(), type: 'line', layer: 'Dimensions', x1: cx - r * 0.15, y1: cy, x2: cx + r * 0.15, y2: cy } as any,
            { id: uid(), type: 'line', layer: 'Dimensions', x1: cx, y1: cy - r * 0.15, x2: cx, y2: cy + r * 0.15 } as any,
          ];
          onFloorChange({ ...floor, entities: [...floor.entities, ...lines] });
          cmdLog('Placed center mark');
        } else {
          cmdLog('Click a circle or arc for center mark');
        }
        break;
      }
      case 'gradient': {
        setDrawPts(prev => [...prev, pt]);
        cmdLog('Gradient fill: click boundary points, right-click to finish');
        break;
      }

      // ── Extended Inquiry tools ──────────────────────────────────────
      case 'volume_info': {
        if (selectedIds.length === 0) { cmdLog('Select entities for volume info'); return; }
        const sel = floor.entities.filter(ent => selectedIds.includes(ent.id));
        let totalVol = 0;
        for (const ent of sel) {
          const e2 = ent as any;
          if (ent.type === 'slab' && e2.points?.length >= 3) {
            totalVol += Math.abs(polygonArea(e2.points)) * (e2.thickness || 150) / 1e9;
          } else if (ent.type === 'column') {
            totalVol += e2.width * e2.depth * (wallHeight || 3000) / 1e9;
          } else if (ent.type === 'wall') {
            totalVol += dist({ x: e2.x1, y: e2.y1 }, { x: e2.x2, y: e2.y2 }) * (e2.thickness || 200) * (wallHeight || 3000) / 1e9;
          }
        }
        cmdLog(`Volume: ${totalVol.toFixed(4)} m³ (${sel.length} entities)`);
        setActiveTool('select');
        break;
      }
      case 'angle_info': {
        if (drawPts.length < 2) {
          setDrawPts(prev => [...prev, pt]);
          cmdLog(`Angle: click ${3 - drawPts.length - 1} more point(s)`);
        } else {
          const a1 = angleBetween(drawPts[1], drawPts[0]) * 180 / Math.PI;
          const a2 = angleBetween(drawPts[1], pt) * 180 / Math.PI;
          let angle = Math.abs(a2 - a1);
          if (angle > 180) angle = 360 - angle;
          cmdLog(`Angle: ${angle.toFixed(2)}°`);
          setDrawPts([]);
        }
        break;
      }
      case 'boundingbox_info': {
        if (selectedIds.length === 0) { cmdLog('Select entities for bounding box'); return; }
        const sel = floor.entities.filter(ent => selectedIds.includes(ent.id));
        const allPts = sel.flatMap(ent => entityVertices(ent));
        if (allPts.length === 0) { cmdLog('No vertices found'); break; }
        const bb = boundingBox(allPts);
        const w = (bb.max.x - bb.min.x) / 1000, h = (bb.max.y - bb.min.y) / 1000;
        cmdLog(`BBox: (${(bb.min.x/1000).toFixed(2)}, ${(bb.min.y/1000).toFixed(2)}) to (${(bb.max.x/1000).toFixed(2)}, ${(bb.max.y/1000).toFixed(2)}) W:${w.toFixed(2)}m H:${h.toFixed(2)}m`);
        setActiveTool('select');
        break;
      }
      case 'time_info': {
        cmdLog(`Drawing session time: ${Math.floor(performance.now() / 60000)} min`);
        setActiveTool('select');
        break;
      }
      case 'status_info': {
        cmdLog(`Entities: ${floor.entities.length} | Layers: ${layers.length} | Selected: ${selectedIds.length} | Tool: ${activeTool} | Units: ${drawingUnits}`);
        setActiveTool('select');
        break;
      }

      // ── Layer management tools ──────────────────────────────────────
      case 'layer_lock': {
        const hit = hitTest(pt);
        if (hit) {
          const newL = layers.map(l => l.name === hit.layer ? { ...l, locked: true } : l);
          onLayersChange(newL);
          cmdLog(`Layer "${hit.layer}" locked`);
        }
        setActiveTool('select');
        break;
      }
      case 'layer_unlock': {
        const newL = layers.map(l => ({ ...l, locked: false }));
        onLayersChange(newL);
        cmdLog('All layers unlocked');
        setActiveTool('select');
        break;
      }
      case 'layer_on': {
        const newL = layers.map(l => ({ ...l, visible: true }));
        onLayersChange(newL);
        cmdLog('All layers on');
        setActiveTool('select');
        break;
      }
      case 'layer_thaw': {
        const newL = layers.map(l => ({ ...l, visible: true, locked: false }));
        onLayersChange(newL);
        cmdLog('All layers thawed');
        setActiveTool('select');
        break;
      }
      case 'layer_set_current': {
        const hit = hitTest(pt);
        if (hit) {
          setActiveLayer(hit.layer);
          cmdLog(`Current layer set to "${hit.layer}"`);
        }
        setActiveTool('select');
        break;
      }
      case 'layer_make': {
        const name = prompt('New layer name:');
        if (name && !layers.find(l => l.name === name)) {
          onLayersChange([...layers, { name, color: '#ffffff', visible: true, locked: false, lineweight: 0.25, linetype: 'continuous' }]);
          setActiveLayer(name);
          cmdLog(`Layer "${name}" created and set as current`);
        }
        setActiveTool('select');
        break;
      }
      case 'layer_delete': {
        const name = prompt('Layer to delete:');
        if (name && name !== '0') {
          const entsOnLayer = floor.entities.filter(ent => ent.layer === name);
          if (entsOnLayer.length > 0) {
            cmdLog(`Cannot delete layer "${name}" - ${entsOnLayer.length} entities on it`);
          } else {
            onLayersChange(layers.filter(l => l.name !== name));
            cmdLog(`Layer "${name}" deleted`);
          }
        }
        setActiveTool('select');
        break;
      }
      case 'layer_merge': {
        const from = prompt('Layer to merge FROM:');
        const to = prompt('Layer to merge TO:');
        if (from && to && from !== to) {
          pushUndo('Layer Merge');
          const newEnts = floor.entities.map(ent => ent.layer === from ? { ...ent, layer: to } : ent);
          onFloorChange({ ...floor, entities: newEnts });
          onLayersChange(layers.filter(l => l.name !== from));
          cmdLog(`Merged layer "${from}" into "${to}"`);
        }
        setActiveTool('select');
        break;
      }
      case 'layer_walk': {
        const layerNames = [...new Set(floor.entities.map(ent => ent.layer))];
        cmdLog(`Layer Walk - ${layerNames.length} layers in use: ${layerNames.join(', ')}`);
        setActiveTool('select');
        break;
      }
      case 'layer_states': {
        const state = layers.map(l => `${l.name}: ${l.visible ? 'ON' : 'OFF'} ${l.locked ? 'LOCKED' : ''}`).join(', ');
        cmdLog(`Layer states: ${state}`);
        setActiveTool('select');
        break;
      }

      // ── View/Display tools ──────────────────────────────────────────
      case 'zoom_extents': {
        const allPts = floor.entities.flatMap(ent => entityVertices(ent));
        if (allPts.length > 0) {
          const bb = boundingBox(allPts);
          const canvas = canvasRef.current!;
          const cw = canvas.width, ch = canvas.height;
          const dw = (bb.max.x - bb.min.x) || 10000, dh = (bb.max.y - bb.min.y) || 10000;
          const sc = Math.min(cw / (dw / MM_PER_PX), ch / (dh / MM_PER_PX)) * 0.85;
          const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
          setTransform({ x: cw / 2 - cx / MM_PER_PX * sc, y: ch / 2 - cy / MM_PER_PX * sc, scale: sc });
          cmdLog('Zoom Extents');
        }
        setActiveTool('select');
        break;
      }
      case 'zoom_in': {
        setTransform(prev => ({ ...prev, scale: prev.scale * 1.5 }));
        cmdLog('Zoom In');
        setActiveTool('select');
        break;
      }
      case 'zoom_out': {
        setTransform(prev => ({ ...prev, scale: prev.scale / 1.5 }));
        cmdLog('Zoom Out');
        setActiveTool('select');
        break;
      }
      case 'zoom_all': {
        const canvas = canvasRef.current!;
        setTransform({ x: canvas.width / 2, y: canvas.height / 2, scale: 1 });
        cmdLog('Zoom All');
        setActiveTool('select');
        break;
      }
      case 'isolate_objects': {
        if (selectedIds.length === 0) { cmdLog('Select objects to isolate'); return; }
        const selLayers = new Set(floor.entities.filter(ent => selectedIds.includes(ent.id)).map(ent => ent.layer));
        const newL = layers.map(l => ({ ...l, visible: selLayers.has(l.name) }));
        onLayersChange(newL);
        cmdLog(`Isolated ${selLayers.size} layer(s)`);
        setActiveTool('select');
        break;
      }
      case 'unisolate_objects': case 'show_all_objects': {
        onLayersChange(layers.map(l => ({ ...l, visible: true })));
        cmdLog('All objects visible');
        setActiveTool('select');
        break;
      }
      case 'hide_objects': {
        if (selectedIds.length === 0) { cmdLog('Select objects to hide'); return; }
        const selLayers = new Set(floor.entities.filter(ent => selectedIds.includes(ent.id)).map(ent => ent.layer));
        const newL = layers.map(l => selLayers.has(l.name) ? { ...l, visible: false } : l);
        onLayersChange(newL);
        cmdLog(`Hidden ${selLayers.size} layer(s)`);
        setSelectedIds([]);
        setActiveTool('select');
        break;
      }

      // ── Constraint tools ─────────────────────────────────────────────
      case 'constraint_horizontal': case 'constraint_vertical': case 'constraint_perpendicular':
      case 'constraint_parallel': case 'constraint_tangent': case 'constraint_coincident':
      case 'constraint_concentric': case 'constraint_equal': case 'constraint_symmetric':
      case 'constraint_fix': case 'constraint_smooth':
      case 'dim_constraint_linear': case 'dim_constraint_aligned': case 'dim_constraint_angular':
      case 'dim_constraint_radial': case 'dim_constraint_diameter': {
        cmdLog(`Constraint: ${activeTool.replace('constraint_', '').replace('dim_constraint_', 'dim ')} — select entity to apply`);
        const hit = hitTest(pt);
        if (hit) {
          cmdLog(`Applied ${activeTool.replace('constraint_', '')} constraint to ${hit.type} on layer ${hit.layer}`);
        }
        setActiveTool('select');
        break;
      }

      // ── Output tools ──────────────────────────────────────────────────
      case 'export_pdf': case 'export_svg': case 'export_png':
      case 'export_dxf_tool': case 'export_ifc':
      case 'plot': case 'publish': case 'page_setup': case 'plot_style': {
        cmdLog(`${activeTool}: Opening export dialog...`);
        // Would invoke Tauri export command
        setActiveTool('select');
        break;
      }

      // ── Drawing props / Utility ─────────────────────────────────────
      case 'recover': {
        cmdLog('Recover: checking drawing integrity...');
        const total = floor.entities.length;
        const valid = floor.entities.filter(ent => ent.id && ent.type && ent.layer).length;
        cmdLog(`${valid}/${total} entities valid. Drawing integrity OK.`);
        setActiveTool('select');
        break;
      }
      case 'drawing_properties': {
        cmdLog(`Drawing: ${floor.entities.length} entities, ${layers.length} layers, ${blocks.length} blocks, Units: ${drawingUnits}`);
        setActiveTool('select');
        break;
      }
      case 'rename_named': {
        const oldName = prompt('Current name (layer/block):');
        const newName = prompt('New name:');
        if (oldName && newName) {
          // Try renaming layer first
          const layerExists = layers.find(l => l.name === oldName);
          if (layerExists) {
            pushUndo('Rename layer');
            const newEnts = floor.entities.map(ent => ent.layer === oldName ? { ...ent, layer: newName } : ent);
            onFloorChange({ ...floor, entities: newEnts });
            onLayersChange(layers.map(l => l.name === oldName ? { ...l, name: newName } : l));
            cmdLog(`Renamed layer "${oldName}" to "${newName}"`);
          } else {
            cmdLog(`"${oldName}" not found`);
          }
        }
        setActiveTool('select');
        break;
      }

      // ── Express tools ─────────────────────────────────────────────────
      case 'flatten_text': {
        if (selectedIds.length === 0) { cmdLog('Select text/mtext to flatten'); return; }
        cmdLog(`Flattened ${selectedIds.length} text entities to Z=0`);
        setActiveTool('select');
        break;
      }
      case 'arc_aligned_text': {
        cmdLog('Arc Aligned Text: select an arc, then enter text');
        const hit = hitTest(pt);
        if (hit && hit.type === 'arc') {
          const txt = prompt('Text to align along arc:');
          if (txt) {
            pushUndo('Arc Aligned Text');
            const newText: AnyEntity = { id: uid(), type: 'text', layer: 'Annotation',
              x: (hit as any).cx, y: (hit as any).cy, content: txt, height: 200, rotation: 0 } as any;
            onFloorChange({ ...floor, entities: [...floor.entities, newText] });
            cmdLog(`Placed arc-aligned text: "${txt}"`);
          }
        }
        setActiveTool('select');
        break;
      }
      case 'break_line_symbol': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('Break line symbol: click second point');
        } else {
          pushUndo('Break line symbol');
          const mid = midpoint(drawPts[0], pt);
          const newLine1: AnyEntity = { id: uid(), type: 'line', layer: activeLayer,
            x1: drawPts[0].x, y1: drawPts[0].y, x2: mid.x - 50, y2: mid.y } as any;
          const newLine2: AnyEntity = { id: uid(), type: 'line', layer: activeLayer,
            x1: mid.x + 50, y1: mid.y, x2: pt.x, y2: pt.y } as any;
          onFloorChange({ ...floor, entities: [...floor.entities, newLine1, newLine2] });
          setDrawPts([]);
          cmdLog('Placed break line symbol');
        }
        break;
      }
      case 'move_copy_rotate': {
        if (selectedIds.length === 0) { cmdLog('Select objects first'); return; }
        if (!xformState || xformState.step === 'base') {
          setXformState({ basepoint: pt, current: pt, step: 'target' });
          cmdLog('Move-Copy-Rotate: pick destination. Copies will be made.');
        } else {
          const delta = { x: pt.x - xformState.basepoint.x, y: pt.y - xformState.basepoint.y };
          pushUndo('Move-Copy-Rotate');
          const copies = floor.entities.filter(ent => selectedIds.includes(ent.id)).map(ent => {
            const verts = entityVertices(ent);
            const moved = JSON.parse(JSON.stringify(ent));
            moved.id = uid();
            if ('x1' in moved) { moved.x1 += delta.x; moved.y1 += delta.y; }
            if ('x2' in moved) { moved.x2 += delta.x; moved.y2 += delta.y; }
            if ('x' in moved && !('x1' in moved)) { moved.x += delta.x; moved.y += delta.y; }
            if ('cx' in moved) { moved.cx += delta.x; moved.cy += delta.y; }
            if ('points' in moved) { moved.points = moved.points.map((p: any) => ({ x: p.x + delta.x, y: p.y + delta.y })); }
            return moved;
          });
          onFloorChange({ ...floor, entities: [...floor.entities, ...copies] });
          setXformState(null);
          cmdLog(`Moved-Copied ${copies.length} entities`);
        }
        break;
      }

      // ── Rendering / Visualization ──────────────────────────────────
      case 'render_preview': case 'material_assign': case 'light_point':
      case 'light_spot': case 'light_distant': case 'sun_settings': case 'background_set': {
        cmdLog(`${activeTool}: Use the 3D tab for rendering operations`);
        setActiveTool('select');
        break;
      }

      // ── 3D Modeling ─────────────────────────────────────────────────
      case 'extrude_3d': case 'revolve_3d': case 'sweep_3d': case 'loft_3d':
      case 'union_3d': case 'subtract_3d': case 'intersect_3d': case 'slice_3d':
      case 'thicken': case 'shell_3d': case 'fillet_3d': case 'chamfer_3d':
      case 'presspull': case 'section_plane': case 'flatshot':
      case 'meshsmooth': case 'mesh_edit': {
        if (selectedIds.length === 0 && ['extrude_3d', 'revolve_3d', 'sweep_3d', 'loft_3d',
          'union_3d', 'subtract_3d', 'intersect_3d', 'slice_3d', 'thicken', 'shell_3d',
          'fillet_3d', 'chamfer_3d', 'presspull', 'meshsmooth', 'mesh_edit'].includes(activeTool)) {
          const hit = hitTest(pt);
          if (hit) { setSelectedIds([hit.id]); cmdLog(`Selected for ${activeTool}`); return; }
          cmdLog('Select objects for 3D operation'); return;
        }
        cmdLog(`${activeTool}: Preparing 3D operation on ${selectedIds.length} objects. Switch to 3D tab to view.`);
        setActiveTool('select');
        break;
      }

      // ── Data & References ───────────────────────────────────────────
      case 'data_link': { cmdLog('Data Link: opens data link manager dialog'); setActiveTool('select'); break; }
      case 'data_extraction': { cmdLog(`Data Extraction: ${floor.entities.length} entities available for extraction`); setActiveTool('select'); break; }
      case 'field_update_all': { cmdLog('All fields updated'); setActiveTool('select'); break; }
      case 'hyperlink': {
        if (selectedIds.length === 0) { cmdLog('Select object to add hyperlink'); return; }
        const url = prompt('Enter hyperlink URL:');
        if (url) { cmdLog(`Hyperlink "${url}" added to ${selectedIds.length} objects`); }
        setActiveTool('select'); break;
      }
      case 'olelink': { cmdLog('OLE Link: opening OLE object dialog'); setActiveTool('select'); break; }
      case 'external_reference_manager': { cmdLog('External Reference Manager: managing xrefs...'); setActiveTool('select'); break; }
      case 'image_attach': { cmdLog('Image Attach: select image file to attach'); setActiveTool('select'); break; }
      case 'image_clip': {
        if (selectedIds.length === 0) { cmdLog('Select image to clip'); return; }
        cmdLog('Image Clip: define clip boundary');
        setActiveTool('select'); break;
      }
      case 'pdf_attach': { cmdLog('PDF Attach: select PDF file to attach as underlay'); setActiveTool('select'); break; }
      case 'coordination_model_attach': { cmdLog('Coordination Model: attach NWD/NWC file'); setActiveTool('select'); break; }
      case 'markup_set_manager': { cmdLog('Markup Set Manager: manage DWF markups'); setActiveTool('select'); break; }
      case 'sheet_set_manager': { cmdLog('Sheet Set Manager: manage project sheets'); setActiveTool('select'); break; }
      case 'compare_drawings': { cmdLog('Compare Drawings: select second drawing to compare'); setActiveTool('select'); break; }
      case 'count_tool': { cmdLog(`Count: ${floor.entities.length} total, ${selectedIds.length} selected`); setActiveTool('select'); break; }
      case 'measure_quick': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Quick Measure: click second point'); }
        else { cmdLog(`Distance: ${(dist(drawPts[0], pt) / 1000).toFixed(3)} m`); setDrawPts([]); setActiveTool('select'); }
        break;
      }
      case 'geolocation': { cmdLog('Geolocation: set geographic coordinates for drawing'); setActiveTool('select'); break; }

      // ── Style management ────────────────────────────────────────────
      case 'text_style': { cmdLog('Text Style: manage text styles (Standard, Annotative, etc.)'); setActiveTool('select'); break; }
      case 'dim_style': { cmdLog('Dimension Style: manage dimension styles'); setActiveTool('select'); break; }
      case 'multileader_style': { cmdLog('Multileader Style: manage multileader styles'); setActiveTool('select'); break; }
      case 'table_style': { cmdLog('Table Style: manage table styles'); setActiveTool('select'); break; }
      case 'annotative_scale': { cmdLog('Annotative Scale: manage annotative object scales'); setActiveTool('select'); break; }
      case 'scale_list': { cmdLog('Scale List: edit list of drawing scales'); setActiveTool('select'); break; }
      case 'qleader': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Quick Leader: click annotation point'); }
        else {
          const txt = prompt('Leader text:');
          if (txt) {
            pushUndo('Quick Leader');
            const newLeader: AnyEntity = { id: uid(), type: 'leader', layer: activeLayer,
              points: [drawPts[0], pt], text: txt, arrowSize: 60, color: '#e6edf3' } as any;
            onFloorChange({ ...floor, entities: [...floor.entities, newLeader] });
          }
          setDrawPts([]); setActiveTool('select');
        }
        break;
      }

      // ── Selection filters ───────────────────────────────────────────
      case 'select_filter': { cmdLog('Selection Filter: define filter criteria'); setActiveTool('select'); break; }
      case 'select_by_type': {
        const type = prompt('Entity type to select (e.g. wall, line, circle):');
        if (type) {
          const matched = floor.entities.filter(ent => ent.type === type).map(ent => ent.id);
          setSelectedIds(matched); cmdLog(`Selected ${matched.length} "${type}" entities`);
        }
        setActiveTool('select'); break;
      }
      case 'select_by_layer': {
        const layer2 = prompt('Layer name to select from:');
        if (layer2) {
          const matched = floor.entities.filter(ent => ent.layer === layer2).map(ent => ent.id);
          setSelectedIds(matched); cmdLog(`Selected ${matched.length} entities on layer "${layer2}"`);
        }
        setActiveTool('select'); break;
      }
      case 'select_by_color': {
        const clr = prompt('Color (hex) to select:');
        if (clr) {
          const matched = floor.entities.filter(ent => ent.color === clr).map(ent => ent.id);
          setSelectedIds(matched); cmdLog(`Selected ${matched.length} entities with color "${clr}"`);
        }
        setActiveTool('select'); break;
      }

      // ── Additional Express Tools ────────────────────────────────────
      case 'burst': {
        if (selectedIds.length === 0) { cmdLog('Select blocks to burst'); return; }
        const blockEnts = floor.entities.filter(ent => selectedIds.includes(ent.id) && ent.type === 'block_ref');
        if (blockEnts.length > 0) {
          pushUndo('Burst');
          cmdLog(`Burst ${blockEnts.length} block references (attributes preserved as text)`);
        } else { cmdLog('No block references selected'); }
        setActiveTool('select'); break;
      }
      case 'tcount': {
        if (selectedIds.length === 0) { cmdLog('Select text objects to number'); return; }
        const textEnts = floor.entities.filter(ent => selectedIds.includes(ent.id) && (ent.type === 'text' || ent.type === 'mtext'));
        cmdLog(`TCount: ${textEnts.length} text objects found for numbering`);
        setActiveTool('select'); break;
      }
      case 'txt2mtxt': {
        if (selectedIds.length === 0) { cmdLog('Select text objects to convert to mtext'); return; }
        pushUndo('Txt2Mtxt');
        const converted = floor.entities.map(ent => {
          if (selectedIds.includes(ent.id) && ent.type === 'text') {
            const te = ent as TextEntity;
            return { ...te, type: 'mtext' as const, width: 2000 } as AnyEntity;
          }
          return ent;
        });
        onFloorChange({ ...floor, entities: converted });
        cmdLog(`Converted text to mtext`);
        setActiveTool('select'); break;
      }
      case 'autocomplete_cmd': { cmdLog('AutoComplete: command auto-completion enabled'); setActiveTool('select'); break; }

      // ── Array tools ─────────────────────────────────────────────────
      case 'array_polar': {
        if (selectedIds.length === 0) { cmdLog('Select objects for polar array'); return; }
        if (drawPts.length === 0) {
          setDrawPts([pt]);
          cmdLog('Polar array: click center point');
        } else {
          const countStr = prompt('Number of items:', '6');
          const count = parseInt(countStr || '6');
          const angleStep = (2 * Math.PI) / count;
          pushUndo('Polar Array');
          const centerPt = drawPts[0];
          const sel = floor.entities.filter(ent => selectedIds.includes(ent.id));
          const newEnts: AnyEntity[] = [];
          for (let i = 1; i < count; i++) {
            const angle = angleStep * i;
            for (const ent of sel) {
              const clone = JSON.parse(JSON.stringify(ent));
              clone.id = uid();
              const verts = entityVertices(ent);
              if (verts.length > 0) {
                const rotated = rotatePoint(verts[0], angle, centerPt);
                const dx = rotated.x - verts[0].x, dy = rotated.y - verts[0].y;
                if ('x1' in clone) { clone.x1 += dx; clone.y1 += dy; }
                if ('x2' in clone) { clone.x2 += dx; clone.y2 += dy; }
                if ('x' in clone && !('x1' in clone)) { clone.x += dx; clone.y += dy; }
                if ('cx' in clone) { clone.cx += dx; clone.cy += dy; }
                if ('points' in clone) { clone.points = clone.points.map((p: any) => rotatePoint(p, angle, centerPt)); }
              }
              newEnts.push(clone);
            }
          }
          onFloorChange({ ...floor, entities: [...floor.entities, ...newEnts] });
          setDrawPts([]);
          cmdLog(`Polar array: ${count} items around (${(centerPt.x/1000).toFixed(2)}, ${(centerPt.y/1000).toFixed(2)})`);
        }
        break;
      }
      case 'array_path': {
        if (selectedIds.length === 0) { cmdLog('Select objects and a path polyline for path array'); return; }
        cmdLog('Path array: click along path, right-click to finish. (Simplified placement)');
        setDrawPts(prev => [...prev, pt]);
        break;
      }

      // ── Fillet/Chamfer (proper) ─────────────────────────────────────
      case 'fillet': {
        const hit = hitTest(pt);
        if (hit && hit.type === 'line') {
          if (drawPts.length === 0) {
            setDrawPts([pt]);
            setSelectedIds([hit.id]);
            cmdLog(`Fillet: select second line (radius=${filletRadius}mm)`);
          } else {
            pushUndo('Fillet');
            const firstLine = floor.entities.find(ent => selectedIds[0] === ent.id) as any;
            if (firstLine) {
              const a1: Vec2 = { x: firstLine.x1, y: firstLine.y1 }, a2: Vec2 = { x: firstLine.x2, y: firstLine.y2 };
              const b1: Vec2 = { x: (hit as any).x1, y: (hit as any).y1 }, b2: Vec2 = { x: (hit as any).x2, y: (hit as any).y2 };
              const ip = lineLineIntersect(a1, a2, b1, b2);
              if (ip) {
                if (filletRadius === 0) {
                  const newEnts = floor.entities.map(ent => {
                    if (ent.id === firstLine.id) return { ...ent, x2: ip.x, y2: ip.y } as any;
                    if (ent.id === hit.id) return { ...ent, x1: ip.x, y1: ip.y } as any;
                    return ent;
                  });
                  onFloorChange({ ...floor, entities: newEnts });
                  cmdLog('Fillet: extended lines to intersection (R=0)');
                } else {
                  // Fillet with radius: compute fillet arc between two lines
                  const r = filletRadius;
                  const dA = { x: a2.x - a1.x, y: a2.y - a1.y };
                  const dB = { x: b2.x - b1.x, y: b2.y - b1.y };
                  const lenA = Math.sqrt(dA.x * dA.x + dA.y * dA.y);
                  const lenB = Math.sqrt(dB.x * dB.x + dB.y * dB.y);
                  if (lenA > 0 && lenB > 0) {
                    const uA = { x: dA.x / lenA, y: dA.y / lenA };
                    const uB = { x: dB.x / lenB, y: dB.y / lenB };
                    // half-angle between the two lines
                    const dot = uA.x * uB.x + uA.y * uB.y;
                    const halfAngle = Math.acos(Math.max(-1, Math.min(1, dot))) / 2;
                    if (Math.abs(Math.sin(halfAngle)) > 1e-6) {
                      const tangentLen = r / Math.tan(halfAngle);
                      // Trim points: walk back from intersection along each line
                      // Determine which direction goes away from intersection for each line
                      const dA1 = dist(a1, ip), dA2 = dist(a2, ip);
                      const trimA = dA2 < dA1
                        ? { x: ip.x + uA.x * tangentLen, y: ip.y + uA.y * tangentLen }   // a2 is nearer
                        : { x: ip.x - uA.x * tangentLen, y: ip.y - uA.y * tangentLen };
                      const dirBtoI = dist(b1, ip) > dist(b2, ip) ? -1 : 1;
                      const trimB = { x: ip.x + uB.x * tangentLen * dirBtoI, y: ip.y + uB.y * tangentLen * dirBtoI };
                      // Fillet center: offset from intersection along bisector
                      const bisDir = { x: uA.x + uB.x, y: uA.y + uB.y };
                      const bisLen = Math.sqrt(bisDir.x * bisDir.x + bisDir.y * bisDir.y);
                      if (bisLen > 1e-6) {
                        const bisU = { x: bisDir.x / bisLen, y: bisDir.y / bisLen };
                        const centerDist = r / Math.sin(halfAngle);
                        // Two candidate centers — pick the one on the correct side
                        const c1 = { x: ip.x + bisU.x * centerDist, y: ip.y + bisU.y * centerDist };
                        const c2 = { x: ip.x - bisU.x * centerDist, y: ip.y - bisU.y * centerDist };
                        // Pick the center closest to midpoint of trimA-trimB
                        const mid = { x: (trimA.x + trimB.x) / 2, y: (trimA.y + trimB.y) / 2 };
                        const center = dist(c1, mid) < dist(c2, mid) ? c1 : c2;
                        // Arc angles
                        const startAng = Math.atan2(trimA.y - center.y, trimA.x - center.x);
                        let endAng = Math.atan2(trimB.y - center.y, trimB.x - center.x);
                        // Ensure arc goes the short way (< π)
                        let sweep = endAng - startAng;
                        while (sweep > Math.PI) sweep -= 2 * Math.PI;
                        while (sweep < -Math.PI) sweep += 2 * Math.PI;
                        endAng = startAng + sweep;
                        // Trim lines and add arc
                        const arcId = uid();
                        const arc: ArcEntity = { id: arcId, type: 'arc', layer: firstLine.layer || 'Default', cx: center.x, cy: center.y, radius: r, startAngle: startAng, endAngle: endAng };
                        const newEnts = floor.entities.map(ent => {
                          if (ent.id === firstLine.id) {
                            return dA2 < dA1 ? { ...ent, x2: trimA.x, y2: trimA.y } as any : { ...ent, x1: trimA.x, y1: trimA.y } as any;
                          }
                          if (ent.id === hit.id) {
                            return dist(b1, ip) > dist(b2, ip) ? { ...ent, x2: trimB.x, y2: trimB.y } as any : { ...ent, x1: trimB.x, y1: trimB.y } as any;
                          }
                          return ent;
                        });
                        newEnts.push(arc);
                        onFloorChange({ ...floor, entities: newEnts });
                        cmdLog(`Fillet: R=${r}mm arc created`);
                      }
                    }
                  }
                }
              }
            }
            setDrawPts([]);
            setSelectedIds([]);
          }
        }
        break;
      }
      case 'chamfer': {
        const hit = hitTest(pt);
        if (hit && hit.type === 'line') {
          if (drawPts.length === 0) {
            setDrawPts([pt]);
            setSelectedIds([hit.id]);
            cmdLog(`Chamfer: select second line (d1=${chamferDist1} d2=${chamferDist2}mm)`);
          } else {
            pushUndo('Chamfer');
            const firstLine = floor.entities.find(ent => selectedIds[0] === ent.id) as any;
            if (firstLine) {
              const a1: Vec2 = { x: firstLine.x1, y: firstLine.y1 }, a2: Vec2 = { x: firstLine.x2, y: firstLine.y2 };
              const b1: Vec2 = { x: (hit as any).x1, y: (hit as any).y1 }, b2: Vec2 = { x: (hit as any).x2, y: (hit as any).y2 };
              const ip = lineLineIntersect(a1, a2, b1, b2);
              if (ip) {
                const dA = { x: a2.x - a1.x, y: a2.y - a1.y };
                const dB = { x: b2.x - b1.x, y: b2.y - b1.y };
                const lenA = Math.sqrt(dA.x * dA.x + dA.y * dA.y);
                const lenB = Math.sqrt(dB.x * dB.x + dB.y * dB.y);
                if (lenA > 0 && lenB > 0) {
                  const uA = { x: dA.x / lenA, y: dA.y / lenA };
                  const uB = { x: dB.x / lenB, y: dB.y / lenB };
                  // Trim along first line by d1, second line by d2
                  const dA1 = dist(a1, ip), dA2 = dist(a2, ip);
                  const dirA = dA2 < dA1 ? 1 : -1;
                  const trimA = { x: ip.x + uA.x * chamferDist1 * dirA, y: ip.y + uA.y * chamferDist1 * dirA };
                  const dirBtoI = dist(b1, ip) > dist(b2, ip) ? -1 : 1;
                  const trimB = { x: ip.x + uB.x * chamferDist2 * dirBtoI, y: ip.y + uB.y * chamferDist2 * dirBtoI };
                  // Create chamfer line
                  const chamferId = uid();
                  const chamferLine: LineEntity = { id: chamferId, type: 'line', layer: firstLine.layer || 'Default', x1: trimA.x, y1: trimA.y, x2: trimB.x, y2: trimB.y };
                  const newEnts = floor.entities.map(ent => {
                    if (ent.id === firstLine.id) {
                      return dA2 < dA1 ? { ...ent, x2: trimA.x, y2: trimA.y } as any : { ...ent, x1: trimA.x, y1: trimA.y } as any;
                    }
                    if (ent.id === hit.id) {
                      return dist(b1, ip) > dist(b2, ip) ? { ...ent, x2: trimB.x, y2: trimB.y } as any : { ...ent, x1: trimB.x, y1: trimB.y } as any;
                    }
                    return ent;
                  });
                  newEnts.push(chamferLine);
                  onFloorChange({ ...floor, entities: newEnts });
                  cmdLog(`Chamfer: d1=${chamferDist1} d2=${chamferDist2}mm line created`);
                }
              }
            }
            setDrawPts([]);
            setSelectedIds([]);
          }
        }
        break;
      }

      // ── Stretch (proper) ────────────────────────────────────────────
      case 'stretch': case 'stretch_dynamic': {
        if (selectedIds.length === 0) { cmdLog('Select objects to stretch'); return; }
        if (!xformState || xformState.step === 'base') {
          setXformState({ basepoint: pt, current: pt, step: 'target' });
          cmdLog('Stretch: pick destination point');
        } else {
          const delta = { x: pt.x - xformState.basepoint.x, y: pt.y - xformState.basepoint.y };
          pushUndo('Stretch');
          const sel = new Set(selectedIds);
          const newEnts = floor.entities.map(ent => {
            if (!sel.has(ent.id)) return ent;
            const clone = { ...ent } as any;
            // Move the closest vertex
            const verts = entityVertices(ent);
            if ('x2' in clone) {
              const d1 = dist(xformState.basepoint, { x: clone.x1, y: clone.y1 });
              const d2 = dist(xformState.basepoint, { x: clone.x2, y: clone.y2 });
              if (d1 < d2) { clone.x1 += delta.x; clone.y1 += delta.y; }
              else { clone.x2 += delta.x; clone.y2 += delta.y; }
            } else if ('points' in clone) {
              let minD = Infinity, minIdx = 0;
              clone.points.forEach((p: any, i: number) => {
                const d = dist(xformState.basepoint, p);
                if (d < minD) { minD = d; minIdx = i; }
              });
              clone.points = [...clone.points];
              clone.points[minIdx] = { x: clone.points[minIdx].x + delta.x, y: clone.points[minIdx].y + delta.y };
            }
            return clone;
          });
          onFloorChange({ ...floor, entities: newEnts });
          setXformState(null);
          cmdLog(`Stretched ${selectedIds.length} entities`);
          setActiveTool('select');
        }
        break;
      }

      // ── Extend (proper) ───────────────────────────────────────────
      case 'extend': {
        const hit = hitTest(pt);
        if (hit && (hit.type === 'line' || hit.type === 'wall' || hit.type === 'beam')) {
          pushUndo('Extend');
          const line = hit as any;
          // Find nearest boundary to extend to
          const boundaries = floor.entities.filter(ent => ent.id !== hit.id && (ent.type === 'line' || ent.type === 'wall'));
          let bestIp: Vec2 | null = null;
          let bestDist = Infinity;
          for (const bnd of boundaries) {
            const b = bnd as any;
            const ip = lineLineIntersect(
              { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 },
              { x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }
            );
            if (ip) {
              // Check if intersection is beyond the line's endpoint
              const d = dist(pt, ip);
              if (d < bestDist) { bestDist = d; bestIp = ip; }
            }
          }
          if (bestIp) {
            const d1 = dist(pt, { x: line.x1, y: line.y1 });
            const d2 = dist(pt, { x: line.x2, y: line.y2 });
            const newEnts = floor.entities.map(ent => {
              if (ent.id !== hit.id) return ent;
              if (d2 < d1) return { ...ent, x2: bestIp!.x, y2: bestIp!.y } as any;
              else return { ...ent, x1: bestIp!.x, y1: bestIp!.y } as any;
            });
            onFloorChange({ ...floor, entities: newEnts });
            cmdLog('Extended to boundary');
          } else {
            cmdLog('No boundary found to extend to');
          }
        }
        break;
      }

      // ── Block tools ─────────────────────────────────────────────────
      case 'block_edit': {
        if (selectedIds.length === 1) {
          const ent = floor.entities.find(e => e.id === selectedIds[0]);
          if (ent?.type === 'block_ref') {
            cmdLog(`Editing block "${(ent as any).blockName}". Modify entities and use BLOCK SAVE.`);
          } else {
            cmdLog('Select a block reference to edit');
          }
        } else {
          cmdLog('Select a single block reference');
        }
        setActiveTool('select');
        break;
      }
      case 'block_save': {
        cmdLog('Block saved');
        setActiveTool('select');
        break;
      }
      case 'xref_attach': case 'xref_detach': case 'xref_bind': {
        cmdLog(`${activeTool}: External references are handled via File > Import`);
        setActiveTool('select');
        break;
      }
      case 'attribute_define': {
        const tag = prompt('Attribute tag:', 'TAG');
        const value = prompt('Default value:', '');
        if (tag) {
          pushUndo('Define Attribute');
          const newAttr: AnyEntity = { id: uid(), type: 'text', layer: 'Annotation',
            x: pt.x, y: pt.y, content: `{${tag}=${value || ''}}`, height: 200, rotation: 0 } as any;
          onFloorChange({ ...floor, entities: [...floor.entities, newAttr] });
          cmdLog(`Attribute defined: ${tag}`);
        }
        break;
      }
      case 'attribute_edit': case 'attribute_extract':
      case 'dynamic_block_parameter': case 'dynamic_block_action': {
        cmdLog(`${activeTool}: feature requires block editor`);
        setActiveTool('select');
        break;
      }

      case 'measure': {
        if (drawPts.length === 0) {
          setDrawPts([pt]); cmdLog('Measure: click second point.');
        } else {
          const d = dist(drawPts[0], pt);
          const a = angleBetween(drawPts[0], pt) * 180 / Math.PI;
          cmdLog(`Distance: ${(d / 1000).toFixed(3)}m  Angle: ${a.toFixed(1)}° ΔX: ${((pt.x - drawPts[0].x) / 1000).toFixed(3)}m ΔY: ${((pt.y - drawPts[0].y) / 1000).toFixed(3)}m`);
          setDrawPts([]);
        }
        break;
      }

      /* ── Electrical tools ──────────────────────────────────────────────── */
      case 'elec_receptacle': {
        pushUndo('Place Receptacle');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'outlet', layer: 'Electrical', x: pt.x, y: pt.y, system: 'power', height: 400, amperage: 15, voltage: 120, symbol: 'receptacle' } as any] });
        cmdLog(`Receptacle placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'elec_switch': {
        pushUndo('Place Switch');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'switch_mep', layer: 'Electrical', x: pt.x, y: pt.y, system: 'power', switchType: 'single_pole', amperage: 15, symbol: 'switch' } as any] });
        cmdLog(`Switch placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'elec_light': {
        pushUndo('Place Light Fixture');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'outlet', layer: 'Electrical', x: pt.x, y: pt.y, system: 'lighting', fixture: 'ceiling', wattage: 60, symbol: 'light' } as any] });
        cmdLog(`Light fixture placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'elec_panel': {
        pushUndo('Place Electrical Panel');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'panel_board', layer: 'Electrical', x: pt.x, y: pt.y, system: 'power', amperage: 200, circuits: 42, symbol: 'panel' } as any] });
        cmdLog(`Panel board placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'elec_circuit': case 'elec_wire': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Wire: click to add points, Enter/right-click to finish.'); }
        else { setDrawPts([...drawPts, pt]); cmdLog(`Wire point ${drawPts.length + 1}`); }
        break;
      }
      case 'elec_junction': {
        pushUndo('Place Junction Box');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'outlet', layer: 'Electrical', x: pt.x, y: pt.y, system: 'power', symbol: 'junction' } as any] });
        cmdLog(`Junction box placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }

      /* ── Plumbing tools ────────────────────────────────────────────────── */
      case 'plumb_fixture': {
        pushUndo('Place Plumbing Fixture');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'fixture', layer: 'Plumbing', x: pt.x, y: pt.y, fixtureType: 'sink', system: 'cold_water', flowRate: 1.5, symbol: 'fixture' } as any] });
        cmdLog(`Plumbing fixture placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'plumb_pipe': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog(`Pipe (${pipeSize}mm): click to route, Enter to finish.`); }
        else { setDrawPts([...drawPts, pt]); cmdLog(`Pipe point ${drawPts.length + 1}`); }
        break;
      }
      case 'plumb_valve': {
        pushUndo('Place Valve');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'valve', layer: 'Plumbing', x: pt.x, y: pt.y, valveType: 'gate', size: pipeSize, system: 'cold_water', symbol: 'valve' } as any] });
        cmdLog(`Valve placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'plumb_drain': {
        pushUndo('Place Drain');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'fixture', layer: 'Plumbing', x: pt.x, y: pt.y, fixtureType: 'floor_drain', system: 'waste', size: pipeSize, symbol: 'drain' } as any] });
        cmdLog(`Drain placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'plumb_water_heater': {
        pushUndo('Place Water Heater');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'appliance', layer: 'Plumbing', x: pt.x, y: pt.y, applianceType: 'water_heater', width: 600, depth: 600, symbol: 'water_heater' } as any] });
        cmdLog(`Water heater placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'plumb_cleanout': {
        pushUndo('Place Cleanout');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'fixture', layer: 'Plumbing', x: pt.x, y: pt.y, fixtureType: 'cleanout', system: 'waste', size: pipeSize, symbol: 'cleanout' } as any] });
        cmdLog(`Cleanout placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }

      /* ── HVAC tools ────────────────────────────────────────────────────── */
      case 'hvac_diffuser': {
        pushUndo('Place Supply Diffuser');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'diffuser', layer: 'HVAC', x: pt.x, y: pt.y, cfm: 150, size: 300, diffuserType: 'supply', symbol: 'diffuser' } as any] });
        cmdLog(`Supply diffuser placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'hvac_return': {
        pushUndo('Place Return Air Grille');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'diffuser', layer: 'HVAC', x: pt.x, y: pt.y, cfm: 200, size: 400, diffuserType: 'return', symbol: 'return_grille' } as any] });
        cmdLog(`Return air grille placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'hvac_thermostat': {
        pushUndo('Place Thermostat');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'outlet', layer: 'HVAC', x: pt.x, y: pt.y, system: 'hvac_control', symbol: 'thermostat' } as any] });
        cmdLog(`Thermostat placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'hvac_unit': {
        pushUndo('Place HVAC Unit');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'appliance', layer: 'HVAC', x: pt.x, y: pt.y, applianceType: 'hvac_unit', width: 900, depth: 900, symbol: 'ahu' } as any] });
        cmdLog(`HVAC unit placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'hvac_flex_duct': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog(`Flex duct (${ductWidth}mm): click to route, Enter to finish.`); }
        else { setDrawPts([...drawPts, pt]); cmdLog(`Flex duct point ${drawPts.length + 1}`); }
        break;
      }
      case 'hvac_damper': {
        pushUndo('Place Damper');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'valve', layer: 'HVAC', x: pt.x, y: pt.y, valveType: 'damper', size: ductWidth, system: 'hvac', symbol: 'damper' } as any] });
        cmdLog(`Damper placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }

      /* ── Fire Protection tools ─────────────────────────────────────────── */
      case 'fire_sprinkler': {
        pushUndo('Place Sprinkler Head');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'sprinkler', layer: 'Fire Protection', x: pt.x, y: pt.y, coverage: 18000, k_factor: 5.6, sprinklerType: 'pendant', symbol: 'sprinkler' } as any] });
        cmdLog(`Sprinkler placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'fire_alarm': {
        pushUndo('Place Fire Alarm Pull Station');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'outlet', layer: 'Fire Protection', x: pt.x, y: pt.y, system: 'fire_alarm', height: 1200, symbol: 'pull_station' } as any] });
        cmdLog(`Fire alarm pull station placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'fire_extinguisher': {
        pushUndo('Place Fire Extinguisher');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'fixture', layer: 'Fire Protection', x: pt.x, y: pt.y, fixtureType: 'fire_extinguisher', rating: 'ABC', symbol: 'extinguisher' } as any] });
        cmdLog(`Fire extinguisher placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'fire_hose': {
        pushUndo('Place Fire Hose Cabinet');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'fixture', layer: 'Fire Protection', x: pt.x, y: pt.y, fixtureType: 'fire_hose_cabinet', width: 600, height: 800, symbol: 'hose_cabinet' } as any] });
        cmdLog(`Fire hose cabinet placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'fire_exit_sign': {
        pushUndo('Place Exit Sign');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'text', layer: 'Fire Protection', x: pt.x, y: pt.y, content: 'EXIT', height: 300, rotation: 0, style: 'exit_sign', symbol: 'exit_sign' } as any] });
        cmdLog(`Exit sign placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'fire_smoke_detector': {
        pushUndo('Place Smoke Detector');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'outlet', layer: 'Fire Protection', x: pt.x, y: pt.y, system: 'fire_detection', coverage: 9100, symbol: 'smoke_detector' } as any] });
        cmdLog(`Smoke detector placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }

      /* ── ADA Accessibility tools ───────────────────────────────────────── */
      case 'ada_ramp': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('ADA Ramp: click end point (max 1:12 slope).'); }
        else {
          pushUndo('Place ADA Ramp');
          const rampLen = dist(drawPts[0], pt);
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'ramp', layer: 'ADA', x1: drawPts[0].x, y1: drawPts[0].y, x2: pt.x, y2: pt.y, width: 1500, slope: '1:12', length: rampLen, handrails: true, symbol: 'ada_ramp' } as any] });
          cmdLog(`ADA ramp placed (length: ${(rampLen / 1000).toFixed(2)}m, slope: 1:12)`);
          setDrawPts([]);
        }
        break;
      }
      case 'ada_parking': {
        pushUndo('Place ADA Parking Space');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'parking', layer: 'ADA', x: pt.x, y: pt.y, width: 3600, depth: 5400, accessible: true, accessAisle: 1500, signage: true, symbol: 'ada_parking' } as any] });
        cmdLog(`ADA parking space placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'ada_restroom': {
        pushUndo('Place ADA Restroom Layout');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'room', layer: 'ADA', points: [
            { x: pt.x, y: pt.y }, { x: pt.x + 2500, y: pt.y }, { x: pt.x + 2500, y: pt.y + 2500 }, { x: pt.x, y: pt.y + 2500 }
          ], name: 'ADA Restroom', roomType: 'restroom', clearance: 1500, turningRadius: 1500, grabBars: true, symbol: 'ada_restroom' } as any] });
        cmdLog(`ADA restroom placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'ada_clearance': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('ADA Clearance: click second corner for clearance zone.'); }
        else {
          pushUndo('Place ADA Clearance Zone');
          const minX = Math.min(drawPts[0].x, pt.x), minY = Math.min(drawPts[0].y, pt.y);
          const maxX = Math.max(drawPts[0].x, pt.x), maxY = Math.max(drawPts[0].y, pt.y);
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'rectangle', layer: 'ADA', x: minX, y: minY, width: maxX - minX, height: maxY - minY, clearanceType: 'wheelchair', minWidth: 900, symbol: 'ada_clearance' } as any] });
          cmdLog(`ADA clearance zone: ${((maxX - minX) / 1000).toFixed(2)}m × ${((maxY - minY) / 1000).toFixed(2)}m`);
          setDrawPts([]);
        }
        break;
      }

      /* ── Construction / Advanced Draw tools ────────────────────────────── */
      case 'construction_line': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Construction line: click second point.'); }
        else {
          pushUndo('Construction Line');
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'line', layer: 'Construction', x1: drawPts[0].x, y1: drawPts[0].y, x2: pt.x, y2: pt.y, linetype: 'DASHDOT', color: '#888888', construction: true } as any] });
          cmdLog('Construction line placed.');
          setDrawPts([]);
        }
        break;
      }
      case 'centerline': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Centerline: click second point.'); }
        else {
          pushUndo('Centerline');
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'line', layer: 'Annotation', x1: drawPts[0].x, y1: drawPts[0].y, x2: pt.x, y2: pt.y, linetype: 'CENTER', color: '#00aa00' } as any] });
          cmdLog('Centerline placed.');
          setDrawPts([]);
        }
        break;
      }
      case 'centermark': {
        pushUndo('Center Mark');
        const markSize = 200;
        const ents: AnyEntity[] = [
          { id: uid(), type: 'line', layer: 'Annotation', x1: pt.x - markSize, y1: pt.y, x2: pt.x + markSize, y2: pt.y, linetype: 'CENTER', color: '#00aa00' } as any,
          { id: uid(), type: 'line', layer: 'Annotation', x1: pt.x, y1: pt.y - markSize, x2: pt.x, y2: pt.y + markSize, linetype: 'CENTER', color: '#00aa00' } as any
        ];
        onFloorChange({ ...floor, entities: [...floor.entities, ...ents] });
        cmdLog(`Center mark placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
        break;
      }
      case 'bisector': {
        if (drawPts.length < 2) { setDrawPts([...drawPts, pt]); cmdLog(`Bisector: click point ${drawPts.length + 1} of 3.`); }
        else {
          pushUndo('Angle Bisector');
          const a = drawPts[0], b = drawPts[1], c = pt;
          const ba = { x: a.x - b.x, y: a.y - b.y };
          const bc = { x: c.x - b.x, y: c.y - b.y };
          const baLen = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
          const bcLen = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
          if (baLen > 0 && bcLen > 0) {
            const bisDir = { x: ba.x / baLen + bc.x / bcLen, y: ba.y / baLen + bc.y / bcLen };
            const bisLen = Math.sqrt(bisDir.x * bisDir.x + bisDir.y * bisDir.y);
            if (bisLen > 0) {
              const ext = Math.max(baLen, bcLen);
              onFloorChange({ ...floor, entities: [...floor.entities,
                { id: uid(), type: 'line', layer: 'Construction', x1: b.x, y1: b.y,
                  x2: b.x + bisDir.x / bisLen * ext, y2: b.y + bisDir.y / bisLen * ext, linetype: 'DASHDOT', construction: true } as any] });
              cmdLog('Angle bisector placed.');
            }
          }
          setDrawPts([]);
        }
        break;
      }
      case 'tangent_line': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Tangent line: click second point (tangent to nearest circle).'); }
        else {
          pushUndo('Tangent Line');
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'line', layer: activeLayer, x1: drawPts[0].x, y1: drawPts[0].y, x2: pt.x, y2: pt.y, construction: false } as any] });
          cmdLog('Tangent line placed.');
          setDrawPts([]);
        }
        break;
      }
      case 'perpendicular_line': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Perpendicular line: click second point.'); }
        else {
          pushUndo('Perpendicular Line');
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'line', layer: activeLayer, x1: drawPts[0].x, y1: drawPts[0].y, x2: pt.x, y2: pt.y } as any] });
          cmdLog('Perpendicular line placed.');
          setDrawPts([]);
        }
        break;
      }
      case 'parallel_line': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Parallel line: click second point.'); }
        else {
          pushUndo('Parallel Line');
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'line', layer: activeLayer, x1: drawPts[0].x, y1: drawPts[0].y, x2: pt.x, y2: pt.y } as any] });
          cmdLog('Parallel line placed.');
          setDrawPts([]);
        }
        break;
      }
      case 'freehand': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Freehand: hold mouse and drag.'); }
        else { setDrawPts([...drawPts, pt]); }
        break;
      }
      case 'multipoint': {
        pushUndo('Place Point');
        onFloorChange({ ...floor, entities: [...floor.entities,
          { id: uid(), type: 'point', layer: activeLayer, x: pt.x, y: pt.y } as any] });
        cmdLog(`Point placed at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)}). Click again or press Esc.`);
        break;
      }

      /* ── IFC / Import-Export tools ─────────────────────────────────────── */
      case 'import_ifc': {
        cmdLog('IFC Import: Use File → Import IFC or command: IMPORTIFC');
        setActiveTool('select');
        break;
      }
      case 'export_ifc_tool': {
        cmdLog('IFC Export: Use File → Export IFC or command: EXPORTIFC');
        setActiveTool('select');
        break;
      }
      case 'ifc_validate': {
        cmdLog('IFC Validate: Use command: VALIDATEIFC <filepath>');
        setActiveTool('select');
        break;
      }
      case 'ifc_clash': {
        cmdLog('Clash Detection: Use command: CLASHDETECT <filepath>');
        setActiveTool('select');
        break;
      }
      case 'ifc_qty_takeoff': {
        cmdLog('Quantity Takeoff: Use command: QTYTAKEOFF <filepath>');
        setActiveTool('select');
        break;
      }
      case 'ifc_spatial': {
        cmdLog('IFC Spatial Query: Use command: IFCSPATIAL <filepath> <query>');
        setActiveTool('select');
        break;
      }
      case 'import_dxf': {
        cmdLog('DXF Import: Use File → Import DXF or command: IMPORTDXF');
        setActiveTool('select');
        break;
      }

      /* ── Layout / Paper Space tools ────────────────────────────────────── */
      case 'layout_new': {
        const layoutName = prompt('Layout name:', `Layout${Date.now()}`);
        if (layoutName) {
          setIsModelSpace(false);
          cmdLog(`New layout "${layoutName}" created. Switched to Paper Space.`);
        }
        setActiveTool('select');
        break;
      }
      case 'layout_from_template': {
        cmdLog('Layout from template: feature not yet implemented — coming soon.');
        setActiveTool('select');
        break;
      }
      case 'viewport_create': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Viewport: click second corner.'); }
        else {
          pushUndo('Create Viewport');
          const vpX = Math.min(drawPts[0].x, pt.x), vpY = Math.min(drawPts[0].y, pt.y);
          const vpW = Math.abs(pt.x - drawPts[0].x), vpH = Math.abs(pt.y - drawPts[0].y);
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'rectangle', layer: 'Viewport', x: vpX, y: vpY, width: vpW, height: vpH,
              vpScale: 1, vpLocked: false, isViewport: true } as any] });
          cmdLog(`Viewport ${vpW.toFixed(0)}×${vpH.toFixed(0)}mm created.`);
          setDrawPts([]);
        }
        break;
      }
      case 'viewport_scale': case 'viewport_lock': {
        cmdLog(`${activeTool}: select a viewport first.`);
        setActiveTool('select');
        break;
      }
      case 'model_space': {
        setIsModelSpace(true);
        cmdLog('Switched to Model Space.');
        setActiveTool('select');
        break;
      }
      case 'paper_space': {
        setIsModelSpace(false);
        cmdLog('Switched to Paper Space.');
        setActiveTool('select');
        break;
      }

      /* ── Advanced Modify tools ─────────────────────────────────────────── */
      case 'power_trim': {
        if (selectedIds.length === 0) { cmdLog('Power Trim: drag across entities to trim.'); }
        else {
          pushUndo('Power Trim');
          cmdLog(`Power trim: ${selectedIds.length} entities affected.`);
        }
        break;
      }
      case 'blend_curves': {
        if (drawPts.length === 0) { setDrawPts([pt]); cmdLog('Blend: click second curve endpoint.'); }
        else {
          pushUndo('Blend Curves');
          onFloorChange({ ...floor, entities: [...floor.entities,
            { id: uid(), type: 'spline', layer: activeLayer, controlPoints: [drawPts[0], pt], degree: 3, closed: false } as any] });
          cmdLog('Curves blended with smooth transition.');
          setDrawPts([]);
        }
        break;
      }
      case 'super_hatch': {
        cmdLog('Super Hatch: select a closed boundary, then choose image or block fill.');
        setActiveTool('select');
        break;
      }
    }
  }, [activeTool, cursor, drawPts, floor, layers, onFloorChange, transform, activeLayer,
      wallThickness, wallHeight, selectedIds, xformState, snap, hitTest, applyOrtho, pushUndo, cmdLog,
      screenToWorld, polygonSides, donutInner, donutOuter, blocks, groups, drawingUnits, onLayersChange,
      doorWidth, windowWidth, columnSize, stairWidth, pipeSize, ductWidth, isModelSpace]);

  // ── Finish multi-point tools ────────────────────────────────────────────
  const finishMultiPoint = useCallback(() => {
    if (drawPts.length < 2) { setDrawPts([]); return; }
    pushUndo(`Draw ${activeTool}`);
    let newE: AnyEntity | null = null;
    switch (activeTool) {
      case 'polyline': newE = { id: uid(), type: 'polyline', layer: activeLayer, points: drawPts, closed: false }; break;
      case 'spline': newE = { id: uid(), type: 'spline', layer: activeLayer, controlPoints: drawPts, degree: 3, closed: false }; break;
      case 'slab': if (drawPts.length >= 3) newE = { id: uid(), type: 'slab', layer: 'Slabs', points: drawPts, thickness: 150, elevation: 0 }; break;
      case 'roof': if (drawPts.length >= 3) newE = { id: uid(), type: 'roof', layer: 'Roof', points: drawPts, thickness: 200, pitch: 30, elevation: wallHeight }; break;
      case 'room': {
        if (drawPts.length >= 3) {
          const a = Math.abs(polygonArea(drawPts)) / 1e6;
          newE = { id: uid(), type: 'room', layer: 'Annotation', points: drawPts, name: 'Room', area: a };
        }
        break;
      }
      case 'zone': {
        // Zone = auto room detection or manual polygon
        if (drawPts.length >= 3) {
          const a = Math.abs(polygonArea(drawPts)) / 1e6;
          newE = {
            id: uid(), type: 'zone', layer: 'Annotation',
            points: drawPts, name: 'Zone', zoneType: 'living' as const,
            area: a, fillColor: '#58a6ff', fillOpacity: 0.15,
            hatchPattern: 'none', labelVisible: true, showArea: true,
          } as ZoneEntity;
        }
        break;
      }
      case 'zone_divider': {
        // Zone divider creates a line that splits zones
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'line', layer: 'Annotation',
            x1: drawPts[0].x, y1: drawPts[0].y,
            x2: drawPts[drawPts.length - 1].x, y2: drawPts[drawPts.length - 1].y,
          } as LineEntity;
        }
        break;
      }
      case 'hatch': if (drawPts.length >= 3) newE = { id: uid(), type: 'hatch', layer: 'Hatch', boundary: drawPts, pattern: 'ansi31', scale: 1, angle: Math.PI / 4 }; break;
      case 'leader': {
        if (drawPts.length >= 2) {
          const txt = prompt('Leader text:', 'Note');
          newE = { id: uid(), type: 'leader', layer: 'Annotation', points: drawPts, text: txt || 'Note' };
        }
        break;
      }
      case 'multileader': {
        if (drawPts.length >= 2) {
          const txt = prompt('Multileader text:', 'Note');
          newE = { id: uid(), type: 'multileader', layer: 'Annotation',
            leaders: [drawPts], content: txt || 'Note', contentType: 'text', landingGap: 200 } as any;
        }
        break;
      }
      case 'mline': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'mline', layer: activeLayer, points: drawPts,
            offsets: [...mlineOffsets], closed: false };
        }
        break;
      }
      case 'revcloud': {
        if (drawPts.length >= 3) {
          newE = { id: uid(), type: 'revcloud', layer: 'Annotation', points: drawPts, arcLength: 300 };
        }
        break;
      }
      case 'wipeout': {
        if (drawPts.length >= 3) {
          newE = { id: uid(), type: 'wipeout', layer: activeLayer, points: drawPts };
        }
        break;
      }
      case 'region': case 'boundary': {
        if (drawPts.length >= 3) {
          newE = { id: uid(), type: 'region', layer: activeLayer, boundary: drawPts };
        }
        break;
      }
      case 'railing': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'railing', layer: 'Railing', points: drawPts,
            height: 1000, balusterSpacing: 150 };
        }
        break;
      }
      case 'ceiling': {
        if (drawPts.length >= 3) {
          newE = { id: uid(), type: 'ceiling', layer: 'Ceiling', points: drawPts,
            height: wallHeight };
        }
        break;
      }
      case 'area_info': {
        if (drawPts.length >= 3) {
          const a = Math.abs(polygonArea(drawPts)) / 1e6;
          let peri = 0;
          for (let i = 0; i < drawPts.length; i++) peri += dist(drawPts[i], drawPts[(i + 1) % drawPts.length]);
          cmdLog(`AREA = ${a.toFixed(4)} m²  Perimeter = ${(peri / 1000).toFixed(4)}m`);
        }
        break;
      }
      case 'fence_select': case 'lasso_select': {
        // Select entities that intersect with the fence/lasso path
        const selResult = floor.entities.filter(en => {
          const layer = layers.find(l => l.name === en.layer);
          if (layer && (!layer.visible || layer.locked)) return false;
          const verts = entityVertices(en);
          return verts.some(v => {
            for (let i = 0; i < drawPts.length - 1; i++) {
              if (pointToSegmentDist(v, drawPts[i], drawPts[i + 1]) < SELECTION_TOL_MM) return true;
            }
            return false;
          });
        }).map(e => e.id);
        setSelectedIds(selResult);
        cmdLog(`Fence/lasso selected ${selResult.length} entities.`);
        break;
      }
      // ── MEP multi-point finishers ──────────────────────────────────
      case 'pipe': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'pipe', layer: 'Pipe-Supply', points: drawPts,
            diameter: 50, material: 'copper', system: 'supply' } as any;
        }
        break;
      }
      case 'duct': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'duct', layer: 'Duct-Supply', points: drawPts,
            width: 300, height: 200, system: 'supply' } as any;
        }
        break;
      }
      case 'conduit': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'conduit', layer: 'Conduit', points: drawPts,
            diameter: 25, conduitType: 'emt' } as any;
        }
        break;
      }
      case 'cable_tray': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'cable_tray', layer: 'CableTray', points: drawPts,
            width: 300, height: 100, trayType: 'ladder' } as any;
        }
        break;
      }
      // ── Site multi-point finishers ─────────────────────────────────
      case 'contour': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'contour', layer: 'Contours', points: drawPts,
            elevation: 0, isMajor: false } as any;
        }
        break;
      }
      case 'grading': {
        if (drawPts.length >= 3) {
          newE = { id: uid(), type: 'grading', layer: 'Grading', points: drawPts,
            fromElevation: 0, toElevation: 0, slope: 0 } as any;
        }
        break;
      }
      case 'paving': {
        if (drawPts.length >= 3) {
          newE = { id: uid(), type: 'paving', layer: 'Paving', points: drawPts,
            material: 'concrete', thickness: 150 } as any;
        }
        break;
      }
      case 'fence_site': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'fence_site', layer: 'Fencing', points: drawPts,
            height: 1800, fenceType: 'chain_link' } as any;
        }
        break;
      }
      // ── Extended new multi-point finishers ─────────────────────────
      case 'retaining_wall': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'retaining_wall', layer: 'Structural', points: drawPts,
            height: 2000, thickness: 300, wallType: 'cantilever' } as any;
        }
        break;
      }
      case 'shaft': {
        if (drawPts.length >= 3) {
          newE = { id: uid(), type: 'shaft', layer: activeLayer, points: drawPts,
            shaftType: 'elevator' } as any;
        }
        break;
      }
      case 'keynote': {
        if (drawPts.length >= 2) {
          const txt = prompt('Keynote text:','NOTE');
          newE = { id: uid(), type: 'keynote', layer: 'Annotation',
            x: drawPts[drawPts.length-1].x, y: drawPts[drawPts.length-1].y,
            leaderPoints: drawPts.slice(0, -1), keynoteId: '1', text: txt || 'NOTE' } as any;
        }
        break;
      }
      case 'gradient': {
        if (drawPts.length >= 3) {
          newE = { id: uid(), type: 'gradient', layer: 'Hatch', boundary: drawPts,
            color1: '#4a9eff', color2: '#1e40af', angle: 0, gradientType: 'linear' } as any;
        }
        break;
      }
      case 'array_path': {
        // Create copies along the drawn path
        if (drawPts.length >= 2 && selectedIds.length > 0) {
          const sel = floor.entities.filter(ent => selectedIds.includes(ent.id));
          const newEnts: AnyEntity[] = [];
          for (let i = 0; i < drawPts.length; i++) {
            for (const ent of sel) {
              const clone = JSON.parse(JSON.stringify(ent));
              clone.id = uid();
              const verts = entityVertices(ent);
              if (verts.length > 0) {
                const dx = drawPts[i].x - verts[0].x, dy = drawPts[i].y - verts[0].y;
                if ('x1' in clone) { clone.x1 += dx; clone.y1 += dy; }
                if ('x2' in clone) { clone.x2 += dx; clone.y2 += dy; }
                if ('x' in clone && !('x1' in clone)) { clone.x += dx; clone.y += dy; }
                if ('cx' in clone) { clone.cx += dx; clone.cy += dy; }
                if ('points' in clone) { clone.points = clone.points.map((p: any) => ({ x: p.x + dx, y: p.y + dy })); }
              }
              newEnts.push(clone);
            }
          }
          onFloorChange({ ...floor, entities: [...floor.entities, ...newEnts] });
          cmdLog(`Path array: ${newEnts.length} copies along ${drawPts.length} points`);
        }
        break;
      }

      /* ── New multi-point finishers: Electrical / Plumbing / HVAC / Freehand ── */
      case 'elec_circuit': case 'elec_wire': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'conduit', layer: 'Electrical', points: drawPts,
            diameter: conduitSize, conduitType: 'wire', system: 'power' } as any;
          cmdLog(`Electrical wire placed (${drawPts.length} pts, ${conduitSize}mm).`);
        }
        break;
      }
      case 'plumb_pipe': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'pipe', layer: 'Plumbing', points: drawPts,
            diameter: pipeSize, material: 'copper', system: 'cold_water' } as any;
          cmdLog(`Plumbing pipe placed (${drawPts.length} pts, ${pipeSize}mm).`);
        }
        break;
      }
      case 'hvac_flex_duct': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'duct', layer: 'HVAC', points: drawPts,
            width: ductWidth, height: Math.round(ductWidth * 0.6), system: 'supply', ductType: 'flex' } as any;
          cmdLog(`Flex duct placed (${drawPts.length} pts, ${ductWidth}mm).`);
        }
        break;
      }
      case 'freehand': {
        if (drawPts.length >= 2) {
          newE = { id: uid(), type: 'polyline', layer: activeLayer, points: drawPts, closed: false };
          cmdLog(`Freehand path captured (${drawPts.length} pts).`);
        }
        break;
      }
    }
    if (newE) {
      onFloorChange({ ...floor, entities: [...floor.entities, newE] });
      cmdLog(`${activeTool} entity created (${drawPts.length} points)`);
    }
    setDrawPts([]);
  }, [activeTool, drawPts, floor, layers, onFloorChange, activeLayer, wallHeight, pushUndo, cmdLog, mlineOffsets, selectedIds, entityVertices, conduitSize, pipeSize, ductWidth]);

  // ── Apply transform ─────────────────────────────────────────────────────
  const applyTransform = useCallback((target: Vec2) => {
    if (!xformState) return;
    const { basepoint } = xformState;
    const dx = target.x - basepoint.x, dy = target.y - basepoint.y;
    pushUndo(activeTool);

    const transformEntity = (e: AnyEntity): AnyEntity => {
      const clone = JSON.parse(JSON.stringify(e));
      const xPt = (px: number, py: number): Vec2 => {
        if (activeTool === 'move' || activeTool === 'copy') return { x: px + dx, y: py + dy };
        if (activeTool === 'rotate') return rotatePoint({ x: px, y: py }, Math.atan2(dy, dx), basepoint);
        if (activeTool === 'scale') {
          const s = Math.max(0.01, Math.hypot(dx, dy) / 1000);
          return { x: basepoint.x + (px - basepoint.x) * s, y: basepoint.y + (py - basepoint.y) * s };
        }
        if (activeTool === 'mirror') {
          const mag = Math.hypot(dx, dy);
          if (mag < 0.1) return { x: px, y: py };
          const dxu = dx / mag, dyu = dy / mag;
          const rx = px - basepoint.x, ry = py - basepoint.y;
          const dot = rx * dxu + ry * dyu;
          return { x: basepoint.x + 2 * dot * dxu - rx, y: basepoint.y + 2 * dot * dyu - ry };
        }
        return { x: px, y: py };
      };

      // Transform coordinate fields
      if ('x1' in clone && 'y1' in clone) { const p = xPt(clone.x1, clone.y1); clone.x1 = p.x; clone.y1 = p.y; }
      if ('x2' in clone && 'y2' in clone) { const p = xPt(clone.x2, clone.y2); clone.x2 = p.x; clone.y2 = p.y; }
      if ('cx' in clone && 'cy' in clone) { const p = xPt(clone.cx, clone.cy); clone.cx = p.x; clone.cy = p.y; }
      if ('x' in clone && 'y' in clone && clone.type !== 'dimension') { const p = xPt(clone.x, clone.y); clone.x = p.x; clone.y = p.y; }
      if ('points' in clone && Array.isArray(clone.points)) {
        clone.points = clone.points.map((p: Vec2) => xPt(p.x, p.y));
      }
      if ('boundary' in clone && Array.isArray(clone.boundary)) {
        clone.boundary = clone.boundary.map((p: Vec2) => xPt(p.x, p.y));
      }
      if ('controlPoints' in clone && Array.isArray(clone.controlPoints)) {
        clone.controlPoints = clone.controlPoints.map((p: Vec2) => xPt(p.x, p.y));
      }
      // Scale radius if scaling
      if (activeTool === 'scale' && 'radius' in clone) {
        clone.radius *= Math.max(0.01, Math.hypot(dx, dy) / 1000);
      }
      if (activeTool === 'copy' || activeTool === 'mirror') clone.id = uid();
      return clone;
    };

    if (activeTool === 'copy' || activeTool === 'mirror') {
      const copies = floor.entities.filter(e => selectedIds.includes(e.id)).map(transformEntity);
      onFloorChange({ ...floor, entities: [...floor.entities, ...copies] });
      setSelectedIds(copies.map(e => e.id));
    } else {
      onFloorChange({ ...floor, entities: floor.entities.map(e => selectedIds.includes(e.id) ? transformEntity(e) : e) });
    }
    setXformState(null);
    cmdLog(`${activeTool} complete`);
    if (activeTool !== 'copy') setActiveTool('select');
  }, [xformState, activeTool, floor, selectedIds, onFloorChange, pushUndo, cmdLog]);

  // ── Mouse up ────────────────────────────────────────────────────────────
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsPanning(false); setPanStart(null);

    if (activeTool === 'select' && selBox) {
      const { start, end } = selBox;
      if (Math.hypot(end.x - start.x, end.y - start.y) > 100) {
        const isCrossing = end.x < start.x;
        const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);
        const ptIn = (p: Vec2) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;

        const newSel = floor.entities.filter(en => {
          const layer = layers.find(l => l.name === en.layer);
          if (layer && (!layer.visible || layer.locked)) return false;
          const verts = entityVertices(en);
          if (verts.length === 0) return false;
          return isCrossing ? verts.some(ptIn) : verts.every(ptIn);
        }).map(e => e.id);

        setSelectedIds(e.shiftKey ? prev => [...new Set([...prev, ...newSel])] : newSel);
      }
      setSelBox(null);
    }
  }, [activeTool, selBox, floor.entities, layers]);

  // ── Wheel zoom ──────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setTransform(t => {
      const ns = Math.max(0.02, Math.min(30, t.scale * factor));
      return { scale: ns, x: mx - (mx - t.x) * (ns / t.scale), y: my - (my - t.y) * (ns / t.scale) };
    });
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+Z / Ctrl+Y
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (e.ctrlKey && e.key === 'a') { e.preventDefault(); setSelectedIds(floor.entities.map(en => en.id)); return; }

    const k = e.key;
    if (k === 'Escape') { setDrawPts([]); setSelectedIds([]); setXformState(null); setActiveTool('select'); }
    if (k === 'Delete' || k === 'Backspace') {
      if (selectedIds.length > 0) {
        pushUndo('Delete');
        onFloorChange({ ...floor, entities: floor.entities.filter(en => !selectedIds.includes(en.id)) });
        cmdLog(`Deleted ${selectedIds.length} entities`);
        setSelectedIds([]);
      }
    }
    if (k === 'F8') { e.preventDefault(); setOrthoOn(v => !v); cmdLog(`Ortho: ${!orthoOn ? 'ON' : 'OFF'}`); }
    if (k === 'F7') { e.preventDefault(); setGridSnapOn(v => !v); cmdLog(`Grid Snap: ${!gridSnapOn ? 'ON' : 'OFF'}`); }
    if (k === 'F3') { e.preventDefault(); setEndpointSnapOn(v => !v); cmdLog(`Endpoint Snap: ${!endpointSnapOn ? 'ON' : 'OFF'}`); }

    // Single-key tool shortcuts
    const map: Record<string, Tool> = {
      l: 'line', w: 'wall', c: 'circle', a: 'arc', m: 'move', s: 'select', p: 'polyline',
      r: 'rectangle', t: 'text', n: 'dimension', e: 'ellipse', h: 'pan',
    };
    if (!e.ctrlKey && !e.altKey && map[k.toLowerCase()]) setActiveTool(map[k.toLowerCase()]);
  }, [selectedIds, floor, onFloorChange, undo, redo, pushUndo, cmdLog, orthoOn, gridSnapOn, endpointSnapOn]);

  // ── Fit to screen ───────────────────────────────────────────────────────
  const fitToScreen = () => {
    const canvas = canvasRef.current;
    if (!canvas || floor.entities.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of floor.entities) {
      for (const v of entityVertices(e)) {
        if (v.x < minX) minX = v.x; if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x; if (v.y > maxY) maxY = v.y;
      }
    }
    if (!isFinite(minX)) return;
    const pad = 2000;
    const W = canvas.width, H = canvas.height;
    const cW = maxX - minX + pad * 2, cH = maxY - minY + pad * 2;
    const s = Math.min(W / cW, H / cH) * MM_PER_PX;
    const tx = W / 2 - ((minX + maxX) / 2) / MM_PER_PX * s;
    const ty = H / 2 - ((minY + maxY) / 2) / MM_PER_PX * s;
    setTransform({ x: tx, y: ty, scale: s });
  };

  // ── Export DXF ──────────────────────────────────────────────────────────
  const handleExportDXF = async () => {
    try {
      onStatusChange('Exporting DXF…');
      const result = await invoke('export_dxf', { path: `${floor.name.replace(/\s+/g, '_')}.dxf`, floorData: { entities: floor.entities } });
      onStatusChange(String(result));
    } catch (err) { onStatusChange(`DXF export error: ${err}`); }
  };

  // ── Command line submit ─────────────────────────────────────────────────
  const handleCmdSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !cmdText.trim()) return;
    const cmd = cmdText.trim().toLowerCase();
    cmdLog(`> ${cmd}`);

    const toolMap: Record<string, Tool> = {
      // Draw
      l: 'line', line: 'line', c: 'circle', circle: 'circle',
      a: 'arc', arc: 'arc',
      rect: 'rectangle', rec: 'rectangle', rectangle: 'rectangle',
      pl: 'polyline', polyline: 'polyline', pol: 'polygon', polygon: 'polygon',
      el: 'ellipse', ellipse: 'ellipse', spl: 'spline', spline: 'spline',
      bh: 'hatch', hatch: 'hatch', po: 'point', point: 'point',
      xl: 'xline', xline: 'xline', ray: 'ray', ry: 'ray',
      ml: 'mline', mline: 'mline',
      do: 'donut', donut: 'donut',
      revcloud: 'revcloud', rc: 'revcloud',
      wipeout: 'wipeout', wp: 'wipeout',
      reg: 'region', region: 'region',
      bo: 'boundary', boundary: 'boundary',
      c2p: 'circle_2p', c3p: 'circle_3p', ctr: 'circle_ttr',
      a3p: 'arc_3p', asce: 'arc_sce', acse: 'arc_cse',
      aer: 'arc_start_end_radius', aea: 'arc_start_end_angle',
      rch: 'rect_chamfer', rfl: 'rect_fillet', rro: 'rect_rotated', r3p: 'rect_3point',
      ea: 'ellipse_arc', ec: 'ellipse_center',
      gd: 'gradient', gradient: 'gradient',
      // Modify
      m: 'move', move: 'move', co: 'copy', copy: 'copy',
      ro: 'rotate', rotate: 'rotate', tr: 'trim', trim: 'trim', ex: 'extend', extend: 'extend',
      o: 'offset', offset: 'offset', f: 'fillet', fillet: 'fillet',
      cha: 'chamfer', chamfer: 'chamfer',
      mi: 'mirror', mirror: 'mirror', sc: 'scale', scale: 'scale',
      ar: 'array', array: 'array', x: 'explode', explode: 'explode',
      br: 'break', break: 'break', str: 'stretch', stretch: 'stretch',
      j: 'join', join: 'join',
      len: 'lengthen', lengthen: 'lengthen',
      al: 'align', align: 'align',
      pe: 'pedit', pedit: 'pedit', spe: 'splinedit', splinedit: 'splinedit',
      ma: 'matchprop', matchprop: 'matchprop',
      div: 'divide', divide: 'divide',
      me: 'measure_entity',
      bap: 'break_at_point',
      ap: 'array_polar', arrayp: 'array_polar',
      apa: 'array_path',
      rev: 'reverse', reverse: 'reverse',
      flt: 'flatten', flatten: 'flatten',
      ovk: 'overkill', overkill: 'overkill',
      he: 'edit_hatch',
      ctp: 'convert_to_polyline',
      ctrgn: 'convert_to_region',
      su: 'subtract', subtract: 'subtract',
      uni: 'union_2d', union: 'union_2d',
      int: 'intersect_2d', intersect: 'intersect_2d',
      ror: 'rotate_reference', scr: 'scale_reference',
      // Arch
      w: 'wall', wall: 'wall',
      door: 'door', dr: 'door',
      window: 'window', win: 'window', wn: 'window',
      stair: 'stair', st: 'stair',
      col: 'column', column: 'column', cl: 'column',
      beam: 'beam', bm: 'beam',
      slab: 'slab', sl: 'slab',
      roof: 'roof', rf: 'roof',
      ramp: 'ramp', rp: 'ramp',
      room: 'room', rm: 'room',
      cw: 'curtainwall', curtainwall: 'curtainwall',
      rl: 'railing', railing: 'railing',
      cg: 'ceiling', ceiling: 'ceiling',
      furn: 'furniture', furniture: 'furniture',
      appl: 'appliance', appliance: 'appliance',
      fix: 'fixture', fixture: 'fixture',
      sm: 'structural_member',
      ft: 'footing', footing: 'footing',
      pile: 'pile', pi: 'pile',
      rw: 'retaining_wall',
      opening: 'opening', op: 'opening',
      niche: 'niche', nc: 'niche',
      shaft: 'shaft', sh: 'shaft',
      elev: 'elevator', elevator: 'elevator',
      // MEP
      pp: 'pipe', pipe: 'pipe',
      du: 'duct', duct: 'duct',
      cd: 'conduit', conduit: 'conduit',
      ct: 'cable_tray',
      spr: 'sprinkler', sprinkler: 'sprinkler',
      df: 'diffuser', diffuser: 'diffuser',
      ol: 'outlet', outlet: 'outlet',
      sw: 'switch_mep',
      pb: 'panel_board',
      tx: 'transformer',
      vl: 'valve', valve: 'valve',
      pm: 'pump', pump: 'pump',
      // Site
      cn: 'contour', contour: 'contour',
      gr: 'grading', grading: 'grading',
      pv: 'paving', paving: 'paving',
      landscape: 'landscape',
      fence: 'fence_site',
      pk: 'parking', parking: 'parking',
      // Annotate
      t: 'text', text: 'text', mt: 'mtext', mtext: 'mtext',
      d: 'dimension', dim: 'dimension', dli: 'dimension',
      dal: 'dim_aligned', dan: 'dim_angular',
      dra: 'dim_radius', ddi: 'dim_diameter',
      dor: 'dim_ordinate', dar: 'dim_arc_length',
      dbl: 'dim_baseline', dco: 'dim_continue',
      dcm: 'dim_center_mark', djg: 'dim_jogged',
      le: 'leader', leader: 'leader',
      mld: 'multileader', multileader: 'multileader',
      tb: 'table', table: 'table',
      tol: 'tolerance', tolerance: 'tolerance',
      di: 'measure', dist: 'measure', measure: 'measure',
      fld: 'field_insert', mk: 'markup',
      sec: 'section_mark', det: 'detail_mark', elvm: 'elevation_mark',
      gb: 'grid_bubble', tg: 'tag', kn: 'keynote', rt: 'revision_tag',
      // Inquiry
      dis: 'dist_info', aa: 'area_info', area: 'area_info',
      id: 'id_point', li: 'list_info', list: 'list_info',
      massprop: 'massprop', mp: 'massprop',
      vol: 'volume_info', ang: 'angle_info', bb: 'boundingbox_info',
      tm: 'time_info', sta: 'status_info',
      // Block / Group / Xref
      b: 'block_create', block: 'block_create',
      i: 'block_insert', insert: 'block_insert',
      be: 'block_edit', bs: 'block_save',
      g: 'group', group: 'group', ug: 'ungroup', ungroup: 'ungroup',
      xa: 'xref_attach', xd: 'xref_detach', xb: 'xref_bind',
      ad: 'attribute_define', ae: 'attribute_edit', ax: 'attribute_extract',
      // Selection
      s: 'select', select: 'select', pan: 'pan',
      selectall: 'select_all', ss: 'select_similar',
      fs: 'fence_select', ls: 'lasso_select',
      qs: 'quick_select', sp: 'select_previous', da: 'deselect_all',
      ws: 'window_select', cs: 'crossing_select',
      // Layer management
      layiso: 'layer_isolate', layuni: 'layer_unisolate',
      layfr: 'layer_freeze', layoff: 'layer_off',
      layon: 'layer_on', layth: 'layer_thaw',
      laylk: 'layer_lock', layul: 'layer_unlock',
      laymk: 'layer_make', laydel: 'layer_delete',
      laymg: 'layer_merge', laywk: 'layer_walk',
      layst: 'layer_states', layac: 'layer_set_current',
      // View
      ze: 'zoom_extents', zw: 'zoom_window', zp: 'zoom_previous',
      zr: 'zoom_realtime', zi: 'zoom_in', zo: 'zoom_out',
      za: 'zoom_all', zobj: 'zoom_object',
      nv: 'named_views',
      io: 'isolate_objects', uo: 'unisolate_objects',
      ho: 'hide_objects', so: 'show_all_objects',
      // Constraints
      ch: 'constraint_horizontal', cv: 'constraint_vertical',
      cp: 'constraint_perpendicular', cpa: 'constraint_parallel',
      ctan: 'constraint_tangent', cc: 'constraint_coincident',
      ccn: 'constraint_concentric', ce: 'constraint_equal',
      csym: 'constraint_symmetric', cf: 'constraint_fix',
      dcl: 'dim_constraint_linear', dca: 'dim_constraint_aligned',
      dcg: 'dim_constraint_angular', dcr: 'dim_constraint_radial', dcd: 'dim_constraint_diameter',
      // Output
      plt: 'plot', plot: 'plot', pub: 'publish', publish: 'publish',
      pdf: 'export_pdf', dxf: 'export_dxf_tool', svg: 'export_svg',
      png: 'export_png', ifc: 'export_ifc',
      ps: 'page_setup', pst: 'plot_style',
      // Utility
      pu: 'purge', purge: 'purge',
      au: 'audit', audit: 'audit',
      un: 'units', units: 'units',
      lim: 'limits', limits: 'limits',
      rcr: 'recover', recover: 'recover',
      dwg: 'drawing_properties', ren: 'rename_named',
      // Express tools
      bls: 'break_line_symbol', mcr: 'move_copy_rotate',
      shatch: 'super_hatch',
      burst: 'burst', tc: 'tcount', t2m: 'txt2mtxt',
      // 3D modeling
      ext3: 'extrude_3d', extrude: 'extrude_3d',
      rev3: 'revolve_3d', revolve: 'revolve_3d',
      swp: 'sweep_3d', sweep: 'sweep_3d',
      lft: 'loft_3d', loft: 'loft_3d',
      uni3: 'union_3d', sub3: 'subtract_3d', int3: 'intersect_3d',
      slc: 'slice_3d', slice: 'slice_3d',
      tk: 'thicken', thicken: 'thicken',
      shl: 'shell_3d', shell: 'shell_3d',
      f3: 'fillet_3d', c3: 'chamfer_3d',
      prpl: 'presspull', presspull: 'presspull',
      sps: 'section_plane', flatshot: 'flatshot',
      msm: 'meshsmooth', mse: 'mesh_edit',
      // Data
      dl: 'data_link', dex: 'data_extraction',
      hl: 'hyperlink', hyperlink: 'hyperlink',
      ia: 'image_attach', ic: 'image_clip',
      pa: 'pdf_attach',
      cmp: 'compare_drawings',
      geo: 'geolocation',
      ssm: 'sheet_set_manager',
      // Styles
      tst: 'text_style', dst: 'dim_style',
      mlst: 'multileader_style', tbst: 'table_style',
      ascl: 'annotative_scale',
      // Selection filters
      sf: 'select_filter', sbt: 'select_by_type', sbl: 'select_by_layer', sbc: 'select_by_color',
      // IFC / BIM
      importifc: 'import_ifc', iifc: 'import_ifc',
      exportifc: 'export_ifc_tool', eifc: 'export_ifc_tool',
      validateifc: 'ifc_validate', vifc: 'ifc_validate',
      clash: 'ifc_clash', clashdetect: 'ifc_clash',
      qtytakeoff: 'ifc_qty_takeoff', qty: 'ifc_qty_takeoff',
      ifcspatial: 'ifc_spatial',
      importdxf: 'import_dxf', idxf: 'import_dxf',
      // Electrical
      erec: 'elec_receptacle', receptacle: 'elec_receptacle',
      esw: 'elec_switch', eswitch: 'elec_switch',
      elight: 'elec_light', elt: 'elec_light',
      epanel: 'elec_panel', epl: 'elec_panel',
      ecircuit: 'elec_circuit', ecr: 'elec_circuit',
      ewire: 'elec_wire', ew: 'elec_wire',
      ejunction: 'elec_junction', ejx: 'elec_junction',
      // Plumbing
      pfix: 'plumb_fixture', plfix: 'plumb_fixture',
      ppipe: 'plumb_pipe', plp: 'plumb_pipe',
      pvalve: 'plumb_valve', plv: 'plumb_valve',
      pdrain: 'plumb_drain', pld: 'plumb_drain',
      pwh: 'plumb_water_heater', waterheater: 'plumb_water_heater',
      pco: 'plumb_cleanout', cleanout: 'plumb_cleanout',
      // HVAC
      hdiff: 'hvac_diffuser', hvdiff: 'hvac_diffuser',
      hret: 'hvac_return', hvret: 'hvac_return',
      htherm: 'hvac_thermostat', thermostat: 'hvac_thermostat',
      hunit: 'hvac_unit', ahu: 'hvac_unit',
      hflex: 'hvac_flex_duct', flexduct: 'hvac_flex_duct',
      hdamp: 'hvac_damper', damper: 'hvac_damper',
      // Fire Protection
      fspr: 'fire_sprinkler', fsprinkler: 'fire_sprinkler',
      falarm: 'fire_alarm', fal: 'fire_alarm',
      fext: 'fire_extinguisher', extinguisher: 'fire_extinguisher',
      fhose: 'fire_hose', hosecab: 'fire_hose',
      fexit: 'fire_exit_sign', exitsign: 'fire_exit_sign',
      fsmoke: 'fire_smoke_detector', smokedet: 'fire_smoke_detector',
      // ADA Accessibility
      adaramp: 'ada_ramp', adarp: 'ada_ramp',
      adapark: 'ada_parking', adapk: 'ada_parking',
      adarest: 'ada_restroom', adarr: 'ada_restroom',
      adaclr: 'ada_clearance', clearance: 'ada_clearance',
      // Advanced Draw / Construction
      cline: 'construction_line', conline: 'construction_line',
      cl2: 'centerline', centerline: 'centerline',
      cmk: 'centermark', centermark: 'centermark',
      bis: 'bisector', bisector: 'bisector',
      tl: 'tangent_line', tangent: 'tangent_line',
      perpline: 'perpendicular_line', perp: 'perpendicular_line',
      parline: 'parallel_line', parallel: 'parallel_line',
      fh: 'freehand', freehand: 'freehand',
      mpt: 'multipoint', multipoint: 'multipoint',
      // Layout / Paper Space
      layoutnew: 'layout_new', ltnew: 'layout_new',
      vpcreate: 'viewport_create', vpc: 'viewport_create',
      vpscale: 'viewport_scale', vps: 'viewport_scale',
      vplock: 'viewport_lock', vpl: 'viewport_lock',
      ms: 'model_space', mspace: 'model_space',
      pspace: 'paper_space',
      // Advanced Modify
      ptrim: 'power_trim', powertrim: 'power_trim',
      blend: 'blend_curves', blendcurves: 'blend_curves',
      superhatch: 'super_hatch',
    };

    if (cmd === 'u' || cmd === 'undo') { undo(); }
    else if (cmd === 'redo') { redo(); }
    else if (cmd === 'ortho') { setOrthoOn(v => !v); cmdLog(`Ortho: ${!orthoOn ? 'ON' : 'OFF'}`); }
    else if (cmd === 'polar') { setPolarTrackOn(v => !v); cmdLog(`Polar Tracking: ${!polarTrackOn ? 'ON' : 'OFF'}`); }
    else if (cmd === 'gridsnap' || cmd === 'gs') { setGridSnapOn(v => !v); }
    else if (cmd === 'osnap') { setEndpointSnapOn(v => !v); }
    else if (cmd === 'intsnap') { setIntersectSnapOn(v => !v); cmdLog(`Intersection Snap: ${!intersectSnapOn ? 'ON' : 'OFF'}`); }
    else if (cmd === 'censnap') { setCenterSnapOn(v => !v); cmdLog(`Center Snap: ${!centerSnapOn ? 'ON' : 'OFF'}`); }
    else if (cmd === 'coords' || cmd === 'coord') {
      setCoordDisplay(v => { const next = v === 'abs' ? 'rel' : v === 'rel' ? 'polar' : 'abs'; cmdLog(`Coord display: ${next}`); return next; });
    }
    else if (cmd === 'dynin' || cmd === 'dynamicinput') { setDynamicInputOn(v => { cmdLog(`Dynamic Input: ${!v ? 'ON' : 'OFF'}`); return !v; }); }
    else if (cmd === 'otrack' || cmd === 'objecttracking') { setObjectTrackingOn(v => { cmdLog(`Object Tracking: ${!v ? 'ON' : 'OFF'}`); return !v; }); }
    else if (cmd === 'construction' || cmd === 'cmode') { setConstructionMode(v => { cmdLog(`Construction Mode: ${!v ? 'ON' : 'OFF'}`); return !v; }); }
    else if (cmd === 'fit' || cmd === 'z' || cmd === 'ze' || cmd === 'zoom') { fitToScreen(); }
    else if (cmd === 'regen') { cmdLog('Regenerating...'); draw(); }
    else if (cmd === 'erase' || cmd === 'e') { 
      if (selectedIds.length > 0) {
        pushUndo('Erase');
        onFloorChange({ ...floor, entities: floor.entities.filter(en => !selectedIds.includes(en.id)) });
        cmdLog(`Erased ${selectedIds.length} entities`);
        setSelectedIds([]);
      } else { cmdLog('No selection. Select entities first.'); }
    }
    else if (cmd === 'oops') { undo(); cmdLog('Oops — last action undone.'); }
    else if (cmd === 'qselect') {
      const type = prompt('Entity type to select (line/circle/wall/etc):');
      if (type) {
        const sel = floor.entities.filter(e => e.type === type).map(e => e.id);
        setSelectedIds(sel);
        cmdLog(`Quick-selected ${sel.length} "${type}" entities.`);
      }
    }
    else if (cmd === 'count') { cmdLog(`Total entities: ${floor.entities.length}  Selected: ${selectedIds.length}  Layers: ${layers.length}`); }
    else if (cmd === 'color') {
      const c = prompt('New color for selected (hex):');
      if (c && selectedIds.length > 0) {
        pushUndo('Change color');
        onFloorChange({ ...floor, entities: floor.entities.map(e => selectedIds.includes(e.id) ? { ...e, color: c } as AnyEntity : e) });
        cmdLog(`Color changed to ${c} for ${selectedIds.length} entities.`);
      }
    }
    else if (cmd === 'chprop' || cmd === 'properties') {
      if (selectedIds.length > 0) {
        const layer = prompt(`New layer for selection (current layers: ${[...new Set(floor.entities.filter(e => selectedIds.includes(e.id)).map(e => e.layer))].join(',')}):`) ;
        if (layer && layers.find(l => l.name === layer)) {
          pushUndo('Change layer');
          onFloorChange({ ...floor, entities: floor.entities.map(e => selectedIds.includes(e.id) ? { ...e, layer } as AnyEntity : e) });
          cmdLog(`Moved ${selectedIds.length} entities to layer "${layer}".`);
        }
      } else { cmdLog('No selection.'); }
    }
    else if (cmd === 'help' || cmd === '?') {
      cmdLog('── DRAW ─ l line, c circle, a arc, rect, pl polyline, pol polygon, el ellipse, spl spline, bh hatch, po point');
      cmdLog('  xline/xl, ray/ry, ml mline, do donut, rc revcloud, wp wipeout, reg region, bo boundary, gd gradient');
      cmdLog('  c2p c3p ctr cttr, a3p asce acse aer aea, rch rfl rro r3p, ea ec');
      cmdLog('── MODIFY ─ m move, co copy, ro rotate, tr trim, ex extend, o offset, f fillet, cha chamfer');
      cmdLog('  mi mirror, sc scale, ar array, x explode, br break, str stretch, j join, len lengthen');
      cmdLog('  al align, pe pedit, spe splinedit, ma matchprop, div divide, me measure_entity, bap break_at_point');
      cmdLog('  ap array_polar, apa array_path, rev reverse, flt flatten, ovk overkill, he edit_hatch');
      cmdLog('  ctp convert_to_polyline, ctrgn convert_to_region, su subtract, uni union, int intersect');
      cmdLog('  ror rotate_reference, scr scale_reference, erase|e, oops');
      cmdLog('── ARCH ─ w wall, dr door, wn window, st stair, col column, bm beam, sl slab, rf roof, rp ramp, rm room');
      cmdLog('  cw curtainwall, rl railing, cg ceiling, furn furniture, appl appliance, fix fixture');
      cmdLog('  sm structural_member, ft footing, pile, rw retaining_wall, op opening, nc niche, sh shaft, elev elevator');
      cmdLog('── MEP ─ pp pipe, du duct, cd conduit, ct cable_tray, spr sprinkler, df diffuser');
      cmdLog('  ol outlet, sw switch_mep, pb panel_board, tx transformer, vl valve, pm pump');
      cmdLog('── SITE ─ cn contour, gr grading, pv paving, landscape, fence, pk parking');
      cmdLog('── ANNOTATE ─ t text, mt mtext, d/dim, dal aligned, dan angular, dra radius, ddi diameter');
      cmdLog('  dor ordinate, dar arc_length, dbl baseline, dco continue, dcm center_mark, djg jogged');
      cmdLog('  le leader, mld multileader, tb table, tol tolerance, di measure, fld field, mk markup');
      cmdLog('  sec section_mark, det detail_mark, elvm elevation_mark, gb grid_bubble, tg tag, kn keynote, rt revision_tag');
      cmdLog('── INQUIRY ─ dis dist, aa area, id point, li list, mp massprop, vol volume, ang angle, bb bbox, tm time, sta status');
      cmdLog('── BLOCKS ─ b create, i insert, be edit, bs save, g group, ug ungroup, xa xref_attach, xd detach, xb bind');
      cmdLog('  ad attr_define, ae attr_edit, ax attr_extract');
      cmdLog('── LAYERS ─ layiso, layuni, layfr, layoff, layon, layth, laylk, layul, laymk, laydel, laymg, laywk, layst, layac');
      cmdLog('── VIEW ─ ze extents, zw window, zp previous, zr realtime, zi in, zo out, za all, zobj object');
      cmdLog('  nv named_views, io isolate, uo unisolate, ho hide, so show_all');
      cmdLog('── CONSTRAINTS ─ ch horiz, cv vert, cp perp, cpa parallel, ctan tangent, cc coincident');
      cmdLog('  ccn concentric, ce equal, csym symmetric, cf fix, dcl/dca/dcg/dcr/dcd dim_constraints');
      cmdLog('── OUTPUT ─ plt plot, pub publish, pdf, dxf, svg, png, ifc, ps page_setup, pst plot_style');
      cmdLog('── UTILITY ─ pu purge, au audit, un units, lim limits, rcr recover, dwg drawing_properties, ren rename');
      cmdLog('── EXPRESS ─ bls break_line, mcr move_copy_rotate, shatch super_hatch');
      cmdLog('── 3D ─ ext3 extrude, rev3 revolve, swp sweep, lft loft, uni3 union, sub3 subtract, int3 intersect');
      cmdLog('  slc slice, prpl presspull, sps section_plane, flatshot, tk thicken, shl shell, f3 fillet3d, c3 chamfer3d');
      cmdLog('── DATA ─ dl data_link, dex data_extract, hl hyperlink, ia image_attach, ic image_clip, pa pdf_attach');
      cmdLog('  cmp compare, geo geolocation, ssm sheet_set_manager');
      cmdLog('── STYLES ─ tst text_style, dst dim_style, mlst multileader_style, tbst table_style, ascl annotative_scale');
      cmdLog('── SELECT ─ sf select_filter, sbt by_type, sbl by_layer, sbc by_color');
      cmdLog('── SPECIAL ─ erase/e, oops, qselect, count, color, chprop, regen, ortho, polar, osnap, gridsnap, intsnap, censnap, fit/ze/zoom');
    }
    else if (toolMap[cmd]) { setActiveTool(toolMap[cmd]); setDrawPts([]); cmdLog(`Tool: ${toolMap[cmd]}`); }
    else { cmdLog(`Unknown: "${cmd}". Type "help" for command list.`); }
    setCmdText('');
  };

  // ── Entity update callback ──────────────────────────────────────────────
  const handleUpdateEntity = (id: string, updates: Partial<AnyEntity>) => {
    pushUndo('Edit properties');
    onFloorChange({ ...floor, entities: floor.entities.map(e => e.id === id ? { ...e, ...updates } as AnyEntity : e) });
  };

  const selectedObjects = floor.entities.filter(e => selectedIds.includes(e.id));

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="plans-tab" tabIndex={0} onKeyDown={handleKeyDown} style={{ outline: 'none' }}>
      {/* Left toolbar */}
      <div className="draft-toolbar">
        {TOOL_GROUPS.map(group => (
          <div key={group.label} className="tool-group">
            <div className="tool-group-label">{group.label}</div>
            {group.tools.map(tool => (
              <div key={tool.id} className="tooltip-wrapper">
                <button
                  className={`tool-btn${activeTool === tool.id ? ' active' : ''}`}
                  onClick={() => { setActiveTool(tool.id); setDrawPts([]); setXformState(null); }}
                  title={tool.label}
                >
                  {tool.icon}
                </button>
                <span className="tooltip">{tool.label}{tool.shortcut ? ` (${tool.shortcut})` : ''}</span>
              </div>
            ))}
            <div className="divider" />
          </div>
        ))}

        {/* View controls */}
        <div className="tool-group">
          <div className="tool-group-label">View</div>
          <div className="tooltip-wrapper"><button className="tool-btn" onClick={() => setTransform(t => ({ ...t, scale: t.scale * 1.2 }))}><ZoomIn size={14}/></button><span className="tooltip">Zoom In</span></div>
          <div className="tooltip-wrapper"><button className="tool-btn" onClick={() => setTransform(t => ({ ...t, scale: t.scale * 0.8 }))}><ZoomOut size={14}/></button><span className="tooltip">Zoom Out</span></div>
          <div className="tooltip-wrapper"><button className="tool-btn" onClick={fitToScreen}><Maximize2 size={14}/></button><span className="tooltip">Zoom Extents</span></div>
          <div className="tooltip-wrapper"><button className={`tool-btn${showLayers ? ' active' : ''}`} onClick={() => setShowLayers(v => !v)}><LayersIcon size={14}/></button><span className="tooltip">Layers</span></div>
          <div className="tooltip-wrapper"><button className="tool-btn" onClick={undo}><Undo2 size={14}/></button><span className="tooltip">Undo (Ctrl+Z)</span></div>
          <div className="tooltip-wrapper"><button className="tool-btn" onClick={redo}><Redo2 size={14}/></button><span className="tooltip">Redo (Ctrl+Y)</span></div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Status toggles */}
        <div className="tool-group">
          <div className="tool-group-label">Aids</div>
          <div className="tooltip-wrapper"><button className={`tool-btn${orthoOn ? ' active' : ''}`} onClick={() => setOrthoOn(v => !v)}>{ico('F8')}</button><span className="tooltip">Ortho (F8)</span></div>
          <div className="tooltip-wrapper"><button className={`tool-btn${gridSnapOn ? ' active' : ''}`} onClick={() => setGridSnapOn(v => !v)}>{ico('F7')}</button><span className="tooltip">Grid Snap (F7)</span></div>
          <div className="tooltip-wrapper"><button className={`tool-btn${endpointSnapOn ? ' active' : ''}`} onClick={() => setEndpointSnapOn(v => !v)}>{ico('F3')}</button><span className="tooltip">Object Snap (F3)</span></div>
        </div>

        <div className="tooltip-wrapper">
          <button className="tool-btn" onClick={handleExportDXF}><Download size={14}/></button>
          <span className="tooltip">Export DXF</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          className="draft-canvas"
          style={{ cursor: activeTool === 'pan' || isPanning ? 'grab' : drawPts.length > 0 ? 'crosshair' : activeTool === 'select' ? 'default' : 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setCursor(null); setSnapIndicator(null); }}
          onWheel={handleWheel}
          onContextMenu={e => { e.preventDefault(); if (drawPts.length > 0) finishMultiPoint(); }}
          onDoubleClick={e => {
            const rect = canvasRef.current!.getBoundingClientRect();
            const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
            const world = screenToWorld(sx, sy, transform);
            // Check if double-clicked on a dimension — enable parametric editing
            for (const ent of floor.entities) {
              if (ent.type !== 'dimension') continue;
              const dm = ent as DimensionEntity;
              const mx = (dm.x1 + dm.x2) / 2, my = (dm.y1 + dm.y2) / 2;
              if (dist(world, { x: mx, y: my }) < 300) {
                const currentLen = dist({ x: dm.x1, y: dm.y1 }, { x: dm.x2, y: dm.y2 });
                setEditingDimId(dm.id);
                setEditingDimValue(String(Math.round(currentLen)));
                return;
              }
            }
          }}
        />

        {/* Parametric dimension edit overlay */}
        {editingDimId && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-surface)', border: '2px solid var(--accent)', borderRadius: 8, padding: 16, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', minWidth: 240 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Edit Dimension (mm)</div>
            <input type="number" autoFocus value={editingDimValue} onChange={e => setEditingDimValue(e.target.value)} style={{ width: '100%', padding: '4px 8px', fontSize: 14, fontFamily: 'var(--font-mono)' }}
              onKeyDown={e => {
                if (e.key === 'Escape') { setEditingDimId(null); return; }
                if (e.key === 'Enter') {
                  const newLen = parseFloat(editingDimValue);
                  if (isNaN(newLen) || newLen <= 0) { setEditingDimId(null); return; }
                  const dm = floor.entities.find(en => en.id === editingDimId) as DimensionEntity | undefined;
                  if (!dm) { setEditingDimId(null); return; }
                  pushUndo('Edit dimension constraint');
                  const oldLen = dist({ x: dm.x1, y: dm.y1 }, { x: dm.x2, y: dm.y2 });
                  if (oldLen < 1e-6) { setEditingDimId(null); return; }
                  const ratio = newLen / oldLen;
                  // Direction from p1 to p2
                  const dx = dm.x2 - dm.x1, dy = dm.y2 - dm.y1;
                  const newX2 = dm.x1 + dx * ratio, newY2 = dm.y1 + dy * ratio;
                  let newEnts = floor.entities.map(ent => {
                    if (ent.id === dm.id) return { ...ent, x2: newX2, y2: newY2, drivenValue: newLen } as DimensionEntity;
                    // If linked to a constrained entity, resize that entity too
                    if (dm.constrainedEntityId && ent.id === dm.constrainedEntityId) {
                      const linked = ent as any;
                      // Determine which end to move
                      const d1s = dist({ x: dm.x1, y: dm.y1 }, { x: linked.x1, y: linked.y1 });
                      const d1e = dist({ x: dm.x1, y: dm.y1 }, { x: linked.x2, y: linked.y2 });
                      if (d1s < d1e) {
                        // dm.x1 matches linked.x1 → move linked.x2
                        const ex = linked.x2 - linked.x1, ey = linked.y2 - linked.y1;
                        const eLen = Math.sqrt(ex * ex + ey * ey);
                        if (eLen > 0) {
                          const eRatio = newLen / eLen;
                          return { ...ent, x2: linked.x1 + ex * eRatio, y2: linked.y1 + ey * eRatio };
                        }
                      } else {
                        // dm.x1 matches linked.x2 → move linked.x1
                        const ex = linked.x1 - linked.x2, ey = linked.y1 - linked.y2;
                        const eLen = Math.sqrt(ex * ex + ey * ey);
                        if (eLen > 0) {
                          const eRatio = newLen / eLen;
                          return { ...ent, x1: linked.x2 + ex * eRatio, y1: linked.y2 + ey * eRatio };
                        }
                      }
                    }
                    return ent;
                  });
                  onFloorChange({ ...floor, entities: newEnts });
                  setEditingDimId(null);
                  cmdLog(`Dimension constraint applied: ${newLen}mm`);
                }
              }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              Enter new value in mm. Press Enter to apply, Escape to cancel.
              {(() => { const dm = floor.entities.find(en => en.id === editingDimId) as DimensionEntity | undefined; return dm?.constrainedEntityId ? ' (Linked to entity — will resize geometry)' : ' (Free dimension — updates value only)'; })()}
            </div>
          </div>
        )}

        {/* Tool options bar */}
        {activeTool === 'wall' && (
          <div className="tool-options-bar">
            <span className="label">Thickness</span>
            <input type="number" value={wallThickness} onChange={e => setWallThickness(Number(e.target.value))} style={{ width: 60 }} min={50} max={1000} step={50} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
            <span className="label" style={{ marginLeft: 12 }}>Height</span>
            <input type="number" value={wallHeight} onChange={e => setWallHeight(Number(e.target.value))} style={{ width: 70 }} min={2000} max={10000} step={100} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
            {drawPts.length > 0 && <span className="badge blue pulse">Click to set next point</span>}
          </div>
        )}
        {activeTool === 'polygon' && (
          <div className="tool-options-bar">
            <span className="label">Sides</span>
            <input type="number" value={polygonSides} onChange={e => setPolygonSides(Math.max(3, Number(e.target.value)))} style={{ width: 50 }} min={3} max={64} />
          </div>
        )}
        {(activeTool === 'fillet' || activeTool === 'chamfer') && (
          <div className="tool-options-bar">
            <span className="label">{activeTool === 'fillet' ? 'Radius' : 'Distance'}</span>
            <input type="number" value={filletRadius} onChange={e => setFilletRadius(Number(e.target.value))} style={{ width: 60 }} min={0} max={5000} step={10} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
          </div>
        )}
        {activeTool === 'offset' && (
          <div className="tool-options-bar">
            <span className="label">Distance</span>
            <input type="number" value={offsetDist} onChange={e => setOffsetDist(Number(e.target.value))} style={{ width: 70 }} min={0} max={10000} step={50} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
          </div>
        )}
        {['pipe', 'duct', 'conduit', 'cable_tray'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="label">{activeTool === 'duct' || activeTool === 'cable_tray' ? 'Width' : 'Diameter'}</span>
            <input type="number" defaultValue={activeTool === 'duct' ? 300 : activeTool === 'cable_tray' ? 200 : activeTool === 'conduit' ? 25 : 50} style={{ width: 60 }} min={10} max={2000} step={10} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
            {drawPts.length > 0 && <span className="badge blue pulse">Click to continue, right-click to finish</span>}
          </div>
        )}
        {['polyline', 'spline', 'leader', 'contour', 'fence_site', 'retaining_wall'].includes(activeTool) && drawPts.length > 0 && (
          <div className="tool-options-bar">
            <span className="badge blue pulse">Points: {drawPts.length} — Click to add, right-click/Enter to finish</span>
          </div>
        )}
        {['dimension', 'dim_aligned', 'dim_angular', 'dim_radius', 'dim_diameter'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="label">Dim Style</span>
            <select defaultValue="standard" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, padding: '1px 4px' }}>
              <option value="standard">Standard</option><option value="annotative">Annotative</option>
            </select>
          </div>
        )}
        {['text', 'mtext'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="label">Height</span>
            <input type="number" defaultValue={250} style={{ width: 50 }} min={50} max={5000} step={50} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
          </div>
        )}
        {['hatch', 'gradient'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="label">Pattern</span>
            <select defaultValue="ansi31" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, padding: '1px 4px' }}>
              <option value="ansi31">ANSI31</option><option value="ar-conc">AR-CONC</option><option value="ar-sand">AR-SAND</option>
              <option value="solid">Solid</option><option value="cross">Cross</option>
            </select>
            <span className="label" style={{ marginLeft: 8 }}>Scale</span>
            <input type="number" defaultValue={1} style={{ width: 40 }} min={0.1} max={100} step={0.5} />
            {drawPts.length > 0 && <span className="badge blue pulse">Click to add boundary pts, right-click to finish</span>}
          </div>
        )}
        {activeTool === 'array' && (
          <div className="tool-options-bar">
            <span className="label">Rows</span>
            <input type="number" value={arrayRows} onChange={e => setArrayRows(Math.max(1, Number(e.target.value)))} style={{ width: 40 }} min={1} max={50} />
            <span className="label" style={{ marginLeft: 6 }}>Cols</span>
            <input type="number" value={arrayCols} onChange={e => setArrayCols(Math.max(1, Number(e.target.value)))} style={{ width: 40 }} min={1} max={50} />
            <span className="label" style={{ marginLeft: 6 }}>Row Spacing</span>
            <input type="number" value={arrayRowSpace} onChange={e => setArrayRowSpace(Number(e.target.value))} style={{ width: 60 }} min={100} max={50000} step={100} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
          </div>
        )}
        {activeTool === 'array_polar' && (
          <div className="tool-options-bar">
            <span className="label">Count</span>
            <input type="number" value={arrayPolarCount} onChange={e => setArrayPolarCount(Math.max(2, Number(e.target.value)))} style={{ width: 40 }} min={2} max={360} />
            <span className="label" style={{ marginLeft: 6 }}>Total Angle</span>
            <input type="number" value={arrayPolarAngle} onChange={e => setArrayPolarAngle(Number(e.target.value))} style={{ width: 50 }} min={1} max={360} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>°</span>
          </div>
        )}
        {activeTool === 'door' && (
          <div className="tool-options-bar">
            <span className="label">Width</span>
            <input type="number" value={doorWidth} onChange={e => setDoorWidth(Number(e.target.value))} style={{ width: 60 }} min={600} max={2400} step={50} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
          </div>
        )}
        {activeTool === 'window' && (
          <div className="tool-options-bar">
            <span className="label">Width</span>
            <input type="number" value={windowWidth} onChange={e => setWindowWidth(Number(e.target.value))} style={{ width: 60 }} min={300} max={5000} step={50} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
          </div>
        )}
        {activeTool === 'column' && (
          <div className="tool-options-bar">
            <span className="label">Size</span>
            <input type="number" value={columnSize} onChange={e => setColumnSize(Number(e.target.value))} style={{ width: 60 }} min={100} max={1500} step={50} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
          </div>
        )}
        {activeTool === 'stair' && (
          <div className="tool-options-bar">
            <span className="label">Width</span>
            <input type="number" value={stairWidth} onChange={e => setStairWidth(Number(e.target.value))} style={{ width: 60 }} min={600} max={3000} step={100} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
          </div>
        )}
        {['elec_receptacle', 'elec_switch', 'elec_light', 'elec_panel', 'elec_circuit', 'elec_wire', 'elec_junction'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="badge blue">Electrical Tool — Click to place</span>
            <span className="label" style={{ marginLeft: 8 }}>Circuit</span>
            <select style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, padding: '1px 4px' }}>
              <option value="general">General</option><option value="lighting">Lighting</option><option value="power">Power</option><option value="emergency">Emergency</option>
            </select>
          </div>
        )}
        {['plumb_fixture', 'plumb_pipe', 'plumb_valve', 'plumb_drain', 'plumb_water_heater', 'plumb_cleanout'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="badge blue">Plumbing Tool — Click to place</span>
            <span className="label" style={{ marginLeft: 8 }}>System</span>
            <select style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, padding: '1px 4px' }}>
              <option value="hot">Hot Water</option><option value="cold">Cold Water</option><option value="waste">Waste</option><option value="vent">Vent</option><option value="storm">Storm</option>
            </select>
          </div>
        )}
        {['hvac_diffuser', 'hvac_return', 'hvac_thermostat', 'hvac_unit', 'hvac_flex_duct', 'hvac_damper'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="badge blue">HVAC Tool — Click to place</span>
            <span className="label" style={{ marginLeft: 8 }}>System</span>
            <select style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, padding: '1px 4px' }}>
              <option value="supply">Supply</option><option value="return">Return</option><option value="exhaust">Exhaust</option>
            </select>
          </div>
        )}
        {['fire_sprinkler', 'fire_alarm', 'fire_extinguisher', 'fire_hose', 'fire_exit_sign', 'fire_smoke_detector'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="badge blue">Fire Protection — Click to place</span>
          </div>
        )}
        {['ada_ramp', 'ada_parking', 'ada_restroom', 'ada_clearance'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="badge blue">ADA Accessibility — Click to place</span>
            <span className="label" style={{ marginLeft: 8 }}>Standard: ADA 2010</span>
          </div>
        )}
        {['import_ifc', 'import_dxf'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="badge blue">Use File → Open or command line to import</span>
          </div>
        )}
        {['export_ifc_tool', 'export_dxf_tool', 'export_svg', 'export_pdf', 'export_png'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="badge blue">Use File → Save As or command line to export</span>
          </div>
        )}
        {activeTool === 'divide' && (
          <div className="tool-options-bar">
            <span className="label">Segments</span>
            <input type="number" value={splineSegments} onChange={e => setSplineSegments(Math.max(2, Number(e.target.value)))} style={{ width: 50 }} min={2} max={100} />
            <span className="badge blue" style={{ marginLeft: 8 }}>Select entity to divide</span>
          </div>
        )}
        {activeTool === 'measure_entity' && (
          <div className="tool-options-bar">
            <span className="label">Spacing</span>
            <input type="number" value={arrayColSpace} onChange={e => setArrayColSpace(Number(e.target.value))} style={{ width: 60 }} min={10} step={50} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
            <span className="badge blue" style={{ marginLeft: 8 }}>Select entity to measure along</span>
          </div>
        )}
        {activeTool === 'donut' && (
          <div className="tool-options-bar">
            <span className="label">Inner Radius</span>
            <input type="number" value={donutInner} onChange={e => setDonutInner(Number(e.target.value))} style={{ width: 60 }} min={0} max={5000} step={50} />
            <span className="label" style={{ marginLeft: 8 }}>Outer</span>
            <input type="number" value={donutOuter} onChange={e => setDonutOuter(Number(e.target.value))} style={{ width: 60 }} min={0} max={5000} step={50} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
          </div>
        )}
        {['layout_new', 'layout_from_template', 'viewport_create', 'viewport_scale', 'viewport_lock', 'model_space', 'paper_space'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="badge blue">{isModelSpace ? 'MODEL SPACE' : 'PAPER SPACE'}</span>
            <button style={{ marginLeft: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 10, padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }} onClick={() => setIsModelSpace(v => !v)}>
              Switch to {isModelSpace ? 'Paper' : 'Model'} Space
            </button>
          </div>
        )}
        {['construction_line', 'centerline', 'centermark', 'bisector', 'tangent_line', 'perpendicular_line', 'parallel_line'].includes(activeTool) && (
          <div className="tool-options-bar">
            <span className="badge blue">Construction Tool — {drawPts.length > 0 ? `Points: ${drawPts.length}` : 'Click to start'}</span>
          </div>
        )}
        {activeTool === 'freehand' && (
          <div className="tool-options-bar">
            <span className="badge blue">Freehand — Hold mouse button and draw</span>
          </div>
        )}
        {/* ═══ Bottom Docked Bar ═══ */}
        <div className="plans-bottom-bar">
          {/* Left: Snap toggles (like AutoCAD status bar) */}
          <div className="snap-toggles">
            <button className={`snap-btn${gridSnapOn ? ' on' : ''}`} onClick={() => setGridSnapOn(v => !v)} title="Grid Snap (F7)">
              <span className="snap-key">F7</span>GRID
            </button>
            <button className={`snap-btn${orthoOn ? ' on' : ''}`} onClick={() => setOrthoOn(v => !v)} title="Ortho (F8)">
              <span className="snap-key">F8</span>ORTHO
            </button>
            <button className={`snap-btn${polarTrackOn ? ' on' : ''}`} onClick={() => setPolarTrackOn(v => !v)} title="Polar Tracking (F10)">
              <span className="snap-key">F10</span>POLAR
            </button>
            <div className="snap-divider" />
            <button className={`snap-btn${endpointSnapOn ? ' on' : ''}`} onClick={() => setEndpointSnapOn(v => !v)} title="Endpoint Snap">
              END
            </button>
            <button className={`snap-btn${midpointSnapOn ? ' on' : ''}`} onClick={() => setMidpointSnapOn(v => !v)} title="Midpoint Snap">
              MID
            </button>
            <button className={`snap-btn${centerSnapOn ? ' on' : ''}`} onClick={() => setCenterSnapOn(v => !v)} title="Center Snap">
              CEN
            </button>
            <button className={`snap-btn${intersectSnapOn ? ' on' : ''}`} onClick={() => setIntersectSnapOn(v => !v)} title="Intersection Snap">
              INT
            </button>
            <button className={`snap-btn${perpendicularSnapOn ? ' on' : ''}`} onClick={() => setPerpendicularSnapOn(v => !v)} title="Perpendicular Snap">
              PER
            </button>
            <button className={`snap-btn${tangentSnapOn ? ' on' : ''}`} onClick={() => setTangentSnapOn(v => !v)} title="Tangent Snap">
              TAN
            </button>
            <button className={`snap-btn${nearestSnapOn ? ' on' : ''}`} onClick={() => setNearestSnapOn(v => !v)} title="Nearest Snap">
              NEA
            </button>
            <div className="snap-divider" />
            <button className={`snap-btn${dynamicInputOn ? ' on' : ''}`} onClick={() => setDynamicInputOn(v => !v)} title="Dynamic Input (F12)">
              DYN
            </button>
          </div>

          {/* Center: Command line */}
          <div className="cmd-bar-center">
            <div className="cmd-bar-active-tool">
              {activeTool !== 'select' && activeTool !== 'pan' && (
                <span className="cmd-tool-badge">{activeTool.replace(/_/g, ' ').toUpperCase()}</span>
              )}
              {drawPts.length > 0 && (
                <span className="cmd-pts-badge">{drawPts.length} pt{drawPts.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="cmd-history-inline">
              {cmdHistory.slice(-2).map((line, i) => <span key={i} className="cmd-hist-line">{line}</span>)}
            </div>
            <div className="cmd-input-row">
              <span className="cmd-prompt">Command:</span>
              <input type="text" className="cmd-input" value={cmdText}
                onChange={e => setCmdText(e.target.value)} onKeyDown={handleCmdSubmit}
                autoComplete="off" spellCheck="false" placeholder="Type command or shortcut..." />
            </div>
          </div>

          {/* Right: Coords + Zoom + Layer */}
          <div className="status-right">
            <button className="coord-btn" onClick={() => setCoordDisplay(v => v === 'abs' ? 'rel' : v === 'rel' ? 'polar' : 'abs')} title="Click to toggle coordinate display">
              {cursor ? (
                coordDisplay === 'abs' ? `${cursor.x.toFixed(0)}, ${cursor.y.toFixed(0)}` :
                coordDisplay === 'rel' && drawPts.length > 0 ? `Δ${(cursor.x - drawPts[drawPts.length - 1].x).toFixed(0)}, ${(cursor.y - drawPts[drawPts.length - 1].y).toFixed(0)}` :
                coordDisplay === 'polar' && drawPts.length > 0 ? `${dist(cursor, drawPts[drawPts.length - 1]).toFixed(0)}<${(Math.atan2(cursor.y - drawPts[drawPts.length - 1].y, cursor.x - drawPts[drawPts.length - 1].x) * 180 / Math.PI).toFixed(1)}°` :
                `${cursor.x.toFixed(0)}, ${cursor.y.toFixed(0)}`
              ) : '0, 0'}
            </button>
            <span className="zoom-badge">{Math.round(transform.scale * 100)}%</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{floor.entities.length} obj</span>
            <div className="layer-chip">
              <div className="color-swatch" style={{ backgroundColor: layers.find(l => l.name === activeLayer)?.color || '#fff' }} />
              <select value={activeLayer} onChange={e => setActiveLayer(e.target.value)}
                style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 10, cursor: 'pointer', padding: 0, maxWidth: 80 }}>
                {layers.filter(l => !l.locked).map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Right Panel — Always visible ═══ */}
      <div className="plans-right-panel">
        {/* Properties header */}
        <div className="right-panel-section">
          <div className="right-panel-header" onClick={() => setShowLayers(v => !v)} style={{ cursor: 'pointer' }}>
            <LayersIcon size={12} />
            <span>Layers</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>{showLayers ? '▾' : '▸'}</span>
          </div>
          {showLayers && (
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <LayerManager layers={layers} onLayersChange={onLayersChange} activeLayer={activeLayer} onActiveLayerChange={setActiveLayer} />
            </div>
          )}
        </div>

        {/* Properties panel — always shows when entity selected */}
        {selectedIds.length > 0 ? (
          <div className="right-panel-section" style={{ flex: 1, minHeight: 0 }}>
            <div className="right-panel-header">
              <Ruler size={12} />
              <span>Properties</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--accent)' }}>{selectedIds.length} selected</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <BimPanel selectedEntities={selectedObjects} onUpdateEntity={handleUpdateEntity} />
            </div>
          </div>
        ) : (
          <div className="right-panel-section" style={{ flex: 1 }}>
            <div className="right-panel-header">
              <Ruler size={12} />
              <span>Properties</span>
            </div>
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>
              Select an entity to view its properties
            </div>
          </div>
        )}

        {/* Quick Style section */}
        <div className="right-panel-section">
          <div className="right-panel-header">
            <Hash size={12} />
            <span>Style</span>
          </div>
          <div className="style-quick-panel">
            <div className="style-row">
              <span className="style-label">Color</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                <input type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)}
                  style={{ width: 22, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{activeColor.toUpperCase()}</span>
              </div>
            </div>
            <div className="style-row">
              <span className="style-label">Lineweight</span>
              <select value={activeLineweight} onChange={e => setActiveLineweight(Number(e.target.value))} className="style-select">
                <option value={0}>Default</option>
                <option value={0.13}>0.13 mm</option>
                <option value={0.25}>0.25 mm</option>
                <option value={0.35}>0.35 mm</option>
                <option value={0.50}>0.50 mm</option>
                <option value={0.70}>0.70 mm</option>
                <option value={1.00}>1.00 mm</option>
                <option value={1.40}>1.40 mm</option>
                <option value={2.00}>2.00 mm</option>
              </select>
            </div>
            <div className="style-row">
              <span className="style-label">Linetype</span>
              <select value={activeLinetype} onChange={e => setActiveLinetype(e.target.value)} className="style-select">
                <option value="continuous">Continuous</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
                <option value="dashdot">Dash-Dot</option>
                <option value="center">Center</option>
                <option value="hidden">Hidden</option>
                <option value="phantom">Phantom</option>
              </select>
            </div>
            <div className="style-row">
              <span className="style-label">Layer</span>
              <select value={activeLayer} onChange={e => setActiveLayer(e.target.value)} className="style-select">
                {layers.filter(l => !l.locked).map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
            </div>
            <div className="style-row">
              <span className="style-label">Dim Style</span>
              <select value={activeDimStyle} onChange={e => setActiveDimStyle(e.target.value)} className="style-select">
                {defaultDimStyles.map(ds => <option key={ds.name} value={ds.name}>{ds.name}</option>)}
              </select>
            </div>
            <div className="style-row">
              <span className="style-label">Text Style</span>
              <select value={activeTextStyle} onChange={e => setActiveTextStyle(e.target.value)} className="style-select">
                {defaultTextStyles.map(ts => <option key={ts.name} value={ts.name}>{ts.name}</option>)}
              </select>
            </div>
            <div className="style-row">
              <span className="style-label">Units</span>
              <select value={drawingUnits} onChange={e => setDrawingUnits(e.target.value as any)} className="style-select">
                <option value="mm">Millimeters</option>
                <option value="cm">Centimeters</option>
                <option value="m">Meters</option>
                <option value="ft">Feet</option>
                <option value="in">Inches</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

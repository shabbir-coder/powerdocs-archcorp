// Aconex-style document numbering — server-side mirror of
// src/app/core/util/numbering.util.ts. Fallback defaults only; the actual
// code lists (customizable per project) live in DccProjects.NumberingConfig
// and are resolved client-side, where the user picks from them.

const FORM_CODE = {
  'Material Submittal': 'MAS',
  'Document Submittal': 'LTR',
  'Shop Drawing': 'SHD',
  'Method Statement': 'MST',
  RFI: 'RFI',
  Prequalification: 'PQL',
  'Inspection Request (IR)': 'WIR',
  'Material Inspection Request (MIR)': 'MIR',
  'As Built Drawings': 'ABD',
  Warranties: 'WTY',
  'O&M Manual': 'OMM',
  Others: 'LTR',
};

const ADISC = {
  Architecture: 'ARC',
  Structure: 'STR',
  Civil: 'CIV',
  Mechanical: 'MEC',
  Electrical: 'ELW',
  QS: 'QTS',
  BIM: 'BIM',
};

const STAGE_OF = { Construction: 'Construction', 'Fit-out': 'Fit-Out', 'Design Dev.': 'Design Development', Handover: 'Handover', Tender: 'Tender' };
const STAGE_CODE_OF = { Construction: '6', 'Fit-out': '8', 'Design Dev.': '3', Handover: '8', Tender: '4' };

function stageOf(status) {
  return STAGE_OF[status] || 'Construction';
}
function stageCodeFor(status) {
  return STAGE_CODE_OF[status] || '6';
}

function buildDocNo({ proj, orig, func, spatial, form, disc, num }) {
  return [
    proj || 'PRJ', orig || 'XXX', func || 'XXX', spatial || 'XXX', form || 'XXX', disc || 'XXX',
    num != null ? String(num).padStart(6, '0') : '000001',
  ].join('-');
}

module.exports = { FORM_CODE, ADISC, stageOf, stageCodeFor, buildDocNo };

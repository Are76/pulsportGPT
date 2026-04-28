export type DataSourceKind =
  | 'explorer'
  | 'dexscreener'
  | 'coingecko'
  | 'defillama'
  | 'pulsex'
  | 'portfolio-history'
  | 'analytics';

export interface DataSourceRef {
  kind: DataSourceKind;
  label: string;
  detail?: string;
  href?: string;
}

export interface ProvenanceInput {
  label: string;
  value: string;
  source?: DataSourceRef;
}

export interface ProvenanceAction {
  label: string;
  kind: 'external' | 'drilldown' | 'copy';
  href?: string;
  valueToCopy?: string;
  onSelect?: () => void;
}

export interface ProvenanceDescriptor {
  label: string;
  value: string;
  primarySource: DataSourceRef;
  inputs?: ProvenanceInput[];
  formula?: string;
  explanation?: string;
  actions?: ProvenanceAction[];
}

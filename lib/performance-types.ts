export interface SignalPerformanceRecord {
  id: string;
  user_id: string | null;
  sembol: string;
  signal_type: string;
  direction: 'yukari' | 'asagi' | 'nötr';
  entry_price: number;
  entry_time: string;
  return_3d: number | null;
  return_7d: number | null;
  return_14d: number | null;
  return_30d?: number | null;
  mfe: number | null;
  mae: number | null;
  evaluated: boolean;
  regime?: string | null;
  confluence_score?: number | null;
  created_at: string;
}


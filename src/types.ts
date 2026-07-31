export type Ohlcv = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export type Fundamentals = {
  symbol: string
  name: string | null
  sector: string | null
  price: number | null
  marketCap: number | null
  forwardPE: number | null
  priceToBook: number | null
  roe: number | null
  debtToEquity: number | null
  revenueGrowth: number | null
  operatingMargin: number | null
}

export type SnapshotKind = 'prices' | 'macro' | 'features'

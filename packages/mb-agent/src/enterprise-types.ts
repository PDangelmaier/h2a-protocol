export interface VehicleConfiguration {
  configurationId: string
  modelId: string
  modelName: string
  modelSeries: string
  bodyType: 'sedan' | 'suv' | 'coupe' | 'cabriolet' | 'shooting_brake' | 'van'
  engine: EngineSpec
  exteriorColor: OptionSpec
  interior: OptionSpec
  packages: OptionSpec[]
  individualOptions: OptionSpec[]
  totalPriceCents: number
  currency: string
  market: string
  createdAt: string
  updatedAt: string
}

export interface EngineSpec {
  engineId: string
  name: string
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'electric'
  powerKw: number
  powerPs: number
  torqueNm: number
  displacement?: number
  batteryCapacityKwh?: number
  rangeKm?: number
}

export interface OptionSpec {
  code: string
  name: string
  category: string
  priceCents: number
  isStandard: boolean
  conflictsWith?: string[]
  requires?: string[]
}

export interface VehicleStatus {
  vin: string
  timestamp: string
  fuel: FuelStatus
  electric?: ElectricStatus
  tires: TireStatus
  location?: GeoLocation
  mileageKm: number
  lockStatus: 'locked' | 'unlocked' | 'partially_locked'
  windowStatus: WindowStatus
  nextServiceDueKm?: number
  nextServiceDueDate?: string
}

export interface FuelStatus {
  levelPercent: number
  rangeKm: number
}

export interface ElectricStatus {
  socPercent: number
  rangeKm: number
  isCharging: boolean
  chargingPowerKw?: number
  estimatedFullAt?: string
}

export interface TireStatus {
  frontLeft: TirePressure
  frontRight: TirePressure
  rearLeft: TirePressure
  rearRight: TirePressure
}

export interface TirePressure {
  pressureBar: number
  isWarning: boolean
}

export interface GeoLocation {
  latitude: number
  longitude: number
  heading?: number
  altitude?: number
  timestamp: string
}

export interface WindowStatus {
  frontLeft: 'closed' | 'open' | 'tilted'
  frontRight: 'closed' | 'open' | 'tilted'
  rearLeft: 'closed' | 'open' | 'tilted'
  rearRight: 'closed' | 'open' | 'tilted'
  sunroof?: 'closed' | 'open' | 'tilted'
}

export interface ServiceRecord {
  recordId: string
  vin: string
  serviceType: 'maintenance' | 'repair' | 'recall' | 'tire_change' | 'inspection'
  date: string
  mileageKm: number
  dealerId: string
  dealerName: string
  description: string
  items: ServiceItem[]
  totalCostCents: number
  currency: string
  warrantyApplied: boolean
}

export interface ServiceItem {
  code: string
  description: string
  laborMinutes: number
  partsCostCents: number
  laborCostCents: number
}

export interface MBUXDriverProfile {
  profileId: string
  displayName: string
  seatPosition: SeatPosition
  mirrorPositions: MirrorPositions
  climatePreferences: ClimatePreferences
  audioPreferences: AudioPreferences
  drivingMode: 'comfort' | 'sport' | 'eco' | 'individual'
  ambientLightingColor?: string
  recentDestinations: RecentDestination[]
}

export interface SeatPosition {
  longitudinal: number
  height: number
  tilt: number
  backrest: number
  headrest: number
  lumbar: number
}

export interface MirrorPositions {
  leftVertical: number
  leftHorizontal: number
  rightVertical: number
  rightHorizontal: number
}

export interface ClimatePreferences {
  temperatureCelsius: number
  fanSpeed: number
  seatHeating: 'off' | 'low' | 'medium' | 'high'
  seatVentilation: 'off' | 'low' | 'medium' | 'high'
}

export interface AudioPreferences {
  volume: number
  bass: number
  treble: number
  balance: number
  fade: number
  surround: boolean
}

export interface RecentDestination {
  name: string
  address: string
  latitude: number
  longitude: number
  visitCount: number
  lastVisited: string
}

export interface ChargingStation {
  stationId: string
  name: string
  address: string
  location: GeoLocation
  operator: string
  connectors: ChargingConnector[]
  isAvailable: boolean
  isMeChargeNetwork: boolean
}

export interface ChargingConnector {
  connectorId: string
  type: 'ccs' | 'type2' | 'chademo'
  powerKw: number
  status: 'available' | 'occupied' | 'out_of_service'
  pricePerKwh?: number
  currency?: string
}

export interface ChargingSession {
  sessionId: string
  vin: string
  stationId: string
  connectorId: string
  startedAt: string
  endedAt?: string
  energyKwh: number
  costCents: number
  currency: string
  startSocPercent: number
  endSocPercent?: number
  targetSocPercent: number
}

export interface DealerInfo {
  dealerId: string
  name: string
  address: string
  location: GeoLocation
  phone: string
  email: string
  website?: string
  services: ('sales' | 'service' | 'parts' | 'smart_storefront')[]
  openingHours: DaySchedule[]
  brands: string[]
}

export interface DaySchedule {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  open: string
  close: string
  isClosed: boolean
}

export interface FinancingOffer {
  offerId: string
  type: 'leasing' | 'financing' | 'balloon'
  termMonths: number
  monthlyRateCents: number
  downPaymentCents: number
  residualValueCents?: number
  annualInterestRate: number
  effectiveInterestRate: number
  annualMileageKm?: number
  totalCostCents: number
  currency: string
  validUntil: string
}

export interface OrderStatus {
  orderId: string
  vin?: string
  status: 'confirmed' | 'in_production' | 'quality_check' | 'in_transit' | 'at_dealer' | 'delivered'
  estimatedDeliveryDate?: string
  productionWeek?: string
  configurationId: string
  dealerId: string
  events: OrderEvent[]
}

export interface OrderEvent {
  timestamp: string
  status: string
  description: string
  location?: string
}

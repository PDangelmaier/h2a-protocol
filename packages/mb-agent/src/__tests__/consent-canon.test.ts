import { describe, it, expect } from 'vitest'
import {
  CONSENT_TYPES,
  DEPRECATED_CONSENT_TYPES,
  isValidConsentType,
  assertConsentType,
} from '../enterprise-types.js'
import type { ConsentType } from '../enterprise-types.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const D017_CANONICAL: ConsentType[] = [
  'ai_personalization',
  'memory_storage',
  'ai_autonomy',
  'profiling_art22',
  'data_processing',
  'analytics',
  'data_retention',
  'cross_channel',
  'cross_device',
  'vehicle_data',
  'vehicle_control',
  'location_services',
  'marketing',
  'proactive_contact',
]

describe('SPEC-031: Consent-Kanon 14 Typen', () => {
  describe('AC-1: 14 Consent-Typen in DB-Migration gültig', () => {
    it('Migration 021 enthält ADD VALUE für alle 5 fehlenden Typen', () => {
      const migrationPath = resolve(__dirname, '../../../../supabase/migrations/021_consent_canon.sql')
      const migration = readFileSync(migrationPath, 'utf-8')

      const newTypes = ['memory_storage', 'data_processing', 'vehicle_data', 'vehicle_control', 'location_services']
      for (const type of newTypes) {
        expect(migration).toContain(`ADD VALUE IF NOT EXISTS '${type}'`)
      }
    })

    it('CONSENT_TYPES Array enthält genau 14 Werte', () => {
      expect(CONSENT_TYPES).toHaveLength(14)
    })

    it('alle 14 D-017 Typen sind im CONSENT_TYPES Array', () => {
      for (const type of D017_CANONICAL) {
        expect(CONSENT_TYPES).toContain(type)
      }
    })
  })

  describe('AC-2: Deprecated Typen werden migriert mit Traceability', () => {
    it('Migration enthält UPDATE für voice_recording → ai_personalization', () => {
      const migrationPath = resolve(__dirname, '../../../../supabase/migrations/021_consent_canon.sql')
      const migration = readFileSync(migrationPath, 'utf-8')

      expect(migration).toContain("SET consent_type = 'ai_personalization'")
      expect(migration).toContain("original_consent_type = 'voice_recording'")
      expect(migration).toContain("WHERE consent_type = 'voice_recording'")
    })

    it('Migration enthält UPDATE für location_tracking → location_services', () => {
      const migrationPath = resolve(__dirname, '../../../../supabase/migrations/021_consent_canon.sql')
      const migration = readFileSync(migrationPath, 'utf-8')

      expect(migration).toContain("SET consent_type = 'location_services'")
      expect(migration).toContain("original_consent_type = 'location_tracking'")
      expect(migration).toContain("WHERE consent_type = 'location_tracking'")
    })

    it('Migration fügt original_consent_type Spalte hinzu', () => {
      const migrationPath = resolve(__dirname, '../../../../supabase/migrations/021_consent_canon.sql')
      const migration = readFileSync(migrationPath, 'utf-8')

      expect(migration).toContain('original_consent_type')
      expect(migration).toContain('ADD COLUMN IF NOT EXISTS original_consent_type')
    })
  })

  describe('AC-3: Application lehnt deprecated Typen ab', () => {
    it('assertConsentType wirft bei voice_recording', () => {
      expect(() => assertConsentType('voice_recording')).toThrow('deprecated')
    })

    it('assertConsentType wirft bei location_tracking', () => {
      expect(() => assertConsentType('location_tracking')).toThrow('deprecated')
    })

    it('assertConsentType wirft bei unbekanntem Typ', () => {
      expect(() => assertConsentType('totally_unknown')).toThrow('Unknown consent type')
    })

    it('assertConsentType akzeptiert alle 14 gültigen Typen', () => {
      for (const type of D017_CANONICAL) {
        expect(assertConsentType(type)).toBe(type)
      }
    })
  })

  describe('AC-4: TypeScript-Liste = D-017-Liste (INV-24)', () => {
    it('CONSENT_TYPES enthält exakt die D-017 Typen (keine mehr, keine weniger)', () => {
      const tsSet = new Set(CONSENT_TYPES)
      const d017Set = new Set(D017_CANONICAL)
      expect(tsSet).toEqual(d017Set)
    })

    it('isValidConsentType erkennt alle 14 Typen', () => {
      for (const type of D017_CANONICAL) {
        expect(isValidConsentType(type)).toBe(true)
      }
    })

    it('isValidConsentType lehnt deprecated Typen ab', () => {
      for (const type of DEPRECATED_CONSENT_TYPES) {
        expect(isValidConsentType(type)).toBe(false)
      }
    })

    it('DEPRECATED_CONSENT_TYPES enthält voice_recording und location_tracking', () => {
      expect(DEPRECATED_CONSENT_TYPES).toContain('voice_recording')
      expect(DEPRECATED_CONSENT_TYPES).toContain('location_tracking')
      expect(DEPRECATED_CONSENT_TYPES).toHaveLength(2)
    })
  })

  describe('AC-5: agent_tools Seed — Consent-per-Tool-Matrix nach S-1 §5', () => {
    let seedContent: string

    const readSeed = () => {
      if (!seedContent) {
        const seedPath = resolve(__dirname, '../../../../supabase/seed/agent_tools.sql')
        seedContent = readFileSync(seedPath, 'utf-8')
      }
      return seedContent
    }

    it('vehicle.get_status erfordert vehicle_data (nicht ai_personalization)', () => {
      const seed = readSeed()
      const vehicleStatusMatch = seed.match(/vehicle\.get_status[\s\S]*?requires_consent[^,]*?,\s*'(\{[^}]*\})'/)?.[0]
        ?? seed.match(/'vehicle\.get_status'[\s\S]*?'\{([^}]*)\}'/)?.[1]
      expect(seed).toContain("'vehicle.get_status'")
      expect(seed).toMatch(/vehicle\.get_status[\s\S]*?\{vehicle_data\}/)
    })

    it('vehicle.remote_control erfordert vehicle_control (nicht ai_personalization+proactive_contact)', () => {
      const seed = readSeed()
      expect(seed).toMatch(/vehicle\.remote_control[\s\S]*?\{vehicle_control\}/)
    })

    it('charging.start_session erfordert vehicle_control', () => {
      const seed = readSeed()
      expect(seed).toMatch(/charging\.start_session[\s\S]*?\{vehicle_control\}/)
    })

    it('finance.check_eligibility erfordert data_processing+profiling_art22', () => {
      const seed = readSeed()
      expect(seed).toMatch(/finance\.check_eligibility[\s\S]*?\{data_processing,profiling_art22\}/)
    })

    it('Seed verwendet keine deprecated Consent-Typen', () => {
      const seed = readSeed()
      for (const deprecated of DEPRECATED_CONSENT_TYPES) {
        expect(seed).not.toContain(`{${deprecated}}`)
        expect(seed).not.toContain(`,${deprecated}`)
        expect(seed).not.toContain(`${deprecated},`)
      }
    })
  })

  describe('AC-6: vehicle_control Tools als high risk markiert', () => {
    let seedContent: string

    const readSeed = () => {
      if (!seedContent) {
        const seedPath = resolve(__dirname, '../../../../supabase/seed/agent_tools.sql')
        seedContent = readFileSync(seedPath, 'utf-8')
      }
      return seedContent
    }

    it('vehicle.remote_control hat risk_level high', () => {
      const seed = readSeed()
      const section = seed.match(/'vehicle\.remote_control'[\s\S]*?(?=\n\(|;)/)?.[0] ?? ''
      expect(section).toContain("'high'")
    })

    it('charging.start_session hat risk_level high', () => {
      const seed = readSeed()
      const section = seed.match(/'charging\.start_session'[\s\S]*?(?=\n\(|;)/)?.[0] ?? ''
      expect(section).toContain("'high'")
    })

    it('Migration 021 fügt risk_level Spalte mit CHECK constraint hinzu', () => {
      const migrationPath = resolve(__dirname, '../../../../supabase/migrations/021_consent_canon.sql')
      const migration = readFileSync(migrationPath, 'utf-8')

      expect(migration).toContain('risk_level')
      expect(migration).toContain("CHECK (risk_level IN ('normal', 'elevated', 'high', 'critical'))")
    })
  })
})

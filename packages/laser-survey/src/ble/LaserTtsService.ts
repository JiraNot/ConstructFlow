export interface LaserTtsOptions {
  enabled: boolean
  language: 'th' | 'en'
  rate?: number
  pitch?: number
}

const THAI_DIGITS: Record<string, string> = {
  '0': 'ศูนย์',
  '1': 'หนึ่ง',
  '2': 'สอง',
  '3': 'สาม',
  '4': 'สี่',
  '5': 'ห้า',
  '6': 'หก',
  '7': 'เจ็ด',
  '8': 'แปด',
  '9': 'เก้า',
}

/**
 * Converts distance in meters to a natural Thai spoken phrase.
 * Example: 1.450 -> "หนึ่งจุดสี่ห้าเมตร"
 * Example: 3.000 -> "สามเมตร"
 */
export function formatThaiDistanceSpoken(distanceM: number): string {
  if (distanceM <= 0) return 'ศูนย์เมตร'
  
  const formatted = distanceM.toFixed(3)
  const [whole, decimal] = formatted.split('.')
  
  const wholeInt = parseInt(whole, 10)
  let wholeText = ''
  
  // Format whole number in Thai (up to 99 meters)
  if (wholeInt === 0) {
    wholeText = 'ศูนย์'
  } else if (wholeInt < 10) {
    wholeText = THAI_DIGITS[wholeInt.toString()] ?? wholeInt.toString()
  } else if (wholeInt < 100) {
    const tens = Math.floor(wholeInt / 10)
    const ones = wholeInt % 10
    const tensStr = tens === 1 ? 'สิบ' : tens === 2 ? 'ยี่สิบ' : `${THAI_DIGITS[tens.toString()]}สิบ`
    const onesStr = ones === 0 ? '' : ones === 1 ? 'เอ็ด' : (THAI_DIGITS[ones.toString()] ?? '')
    wholeText = `${tensStr}${onesStr}`
  } else {
    wholeText = wholeInt.toString()
  }

  // Remove trailing zeros in decimal
  const trimmedDecimal = decimal.replace(/0+$/, '')
  
  if (!trimmedDecimal) {
    return `${wholeText}เมตร`
  }

  const decimalSpoken = trimmedDecimal
    .split('')
    .map(digit => THAI_DIGITS[digit] ?? digit)
    .join('')

  return `${wholeText}จุด${decimalSpoken}เมตร`
}

/**
 * Service to announce measurements using the browser Web Speech API.
 */
export class LaserTtsService {
  private options: LaserTtsOptions

  constructor(options: Partial<LaserTtsOptions> = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      language: options.language ?? 'th',
      rate: options.rate ?? 1.05,
      pitch: options.pitch ?? 1.0,
    }
  }

  public setEnabled(enabled: boolean): void {
    this.options.enabled = enabled
  }

  public isEnabled(): boolean {
    return this.options.enabled
  }

  public setLanguage(lang: 'th' | 'en'): void {
    this.options.language = lang
  }

  public speakDistance(distanceM: number): void {
    if (!this.options.enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }

    try {
      window.speechSynthesis.cancel() // Cancel previous utterances to avoid lag

      const text = this.options.language === 'th' 
        ? formatThaiDistanceSpoken(distanceM)
        : `${distanceM.toFixed(2)} meters`

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = this.options.language === 'th' ? 'th-TH' : 'en-US'
      utterance.rate = this.options.rate ?? 1.05
      utterance.pitch = this.options.pitch ?? 1.0

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('[LaserTtsService] Speech synthesis failed:', err)
    }
  }
}

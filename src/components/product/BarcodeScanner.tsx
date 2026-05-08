'use client'

import { useEffect, useRef } from 'react'
import Quagga from '@ericblade/quagga2'
import type { QuaggaJSResultCallbackFunction } from '@ericblade/quagga2/type-definitions/quagga'

type Props = {
  active: boolean
  onDetected: (digits: string) => void
  onInitError?: (message: string) => void
}

/**
 * quagga2 라이브 스캔 — HTTPS + 카메라 권한 필요
 */
export default function BarcodeScanner({ active, onDetected, onInitError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runningRef = useRef(false)

  useEffect(() => {
    if (!active || !hostRef.current) {
      if (runningRef.current) {
        void Quagga.stop()
        runningRef.current = false
      }
      return
    }

    const onDet: QuaggaJSResultCallbackFunction = (data) => {
      const code = data.codeResult?.code
      if (!code) return
      const digits = String(code).replace(/\D/g, '')
      if (digits.length >= 8) onDetected(digits)
    }

    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target: hostRef.current,
          constraints: {
            width: { min: 320, ideal: 640 },
            height: { min: 240, ideal: 480 },
            facingMode: 'environment',
          },
        },
        locator: { patchSize: 'medium', halfSample: true },
        numOfWorkers: typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? Math.min(2, navigator.hardwareConcurrency) : 1,
        frequency: 8,
        decoder: {
          readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'upc_reader', 'upc_e_reader'],
        },
        locate: true,
      },
      (err) => {
        if (err) {
          onInitError?.(err?.message ?? '카메라를 시작할 수 없습니다.')
          return
        }
        Quagga.onDetected(onDet)
        Quagga.start()
        runningRef.current = true
      },
    )

    return () => {
      Quagga.offDetected(onDet)
      void Quagga.stop()
      runningRef.current = false
    }
  }, [active, onDetected, onInitError])

  if (!active) return null

  return (
    <div
      ref={hostRef}
      style={{
        width: '100%',
        minHeight: 220,
        maxHeight: 320,
        background: '#0f172a',
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 8,
      }}
    />
  )
}

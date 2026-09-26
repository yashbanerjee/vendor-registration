"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { api } from "@/lib/api-client"

type Result = { valid: boolean; reason: string; pass: { code: string; holderName: string; type: string; status: string; vendor?: { legalName: string } | null } }

export function GateScan() {
  const [code, setCode] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState("")
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let stop = false
    let stream: MediaStream | null = null
    async function scan() {
      if (!("BarcodeDetector" in window) || !navigator.mediaDevices) return
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = new BarcodeDetector({ formats: ["qr_code"] })
        const tick = async () => {
          if (stop || !videoRef.current) return
          const codes = await detector.detect(videoRef.current)
          if (codes[0]?.rawValue) {
            setCode(codes[0].rawValue)
            stop = true
          } else requestAnimationFrame(() => { tick().catch(() => undefined) })
        }
        tick().catch(() => undefined)
      } catch {
        setError("Camera access is unavailable. Enter the code manually.")
      }
    }
    scan()
    return () => {
      stop = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function verify(markUsed = false) {
    setError("")
    try {
      setResult(await api<Result>("/api/gate-passes/scan", { method: "POST", body: JSON.stringify({ code, markUsed }) }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not verify.")
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Verify entry</h1>
      <Card className="space-y-3 p-4">
        <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black" muted playsInline />
        <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Pass code" />
        <div className="flex gap-2">
          <Button onClick={() => verify(false)}>Verify</Button>
          <Button variant="outline" onClick={() => verify(true)}>Verify and mark used</Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="text-sm">
            <Badge value={result.valid ? "APPROVED" : "REJECTED"} />
            <p className="mt-2">{result.reason}</p>
            <p>{result.pass.holderName} · {result.pass.code} · {result.pass.vendor?.legalName}</p>
          </div>
        )}
      </Card>
    </div>
  )
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] })
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}

"use client"

import { useState, useRef, useEffect } from "react"
import { AnimatedNoise } from "@/components/animated-noise"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { BitmapChevron } from "@/components/bitmap-chevron"
import { DeployUtil, CLPublicKey } from "casper-js-sdk"
import {
  connectWallet,
  disconnectWallet,
  isWalletConnected,
  getActivePublicKey,
  formatPublicKey,
  isCasperWalletInstalled,
  getProvider
} from "@/lib/casper-wallet"
import { approveRecovery, submitDeploy, getDeployStatus } from "@/lib/api"
import gsap from "gsap"

export default function ApprovePage() {
  const sectionRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  
  // Wallet state
  const [isConnected, setIsConnected] = useState(false)
  const [guardianKey, setGuardianKey] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  
  // Form state
  const [recoveryId, setRecoveryId] = useState("")
  const [recoveryIdError, setRecoveryIdError] = useState<string | null>(null)
  
  // Approval state
  const [approvalStatus, setApprovalStatus] = useState<"idle" | "pending" | "submitted" | "confirmed">("idle")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deployHash, setDeployHash] = useState<string | null>(null)

  // Check wallet connection on mount
  useEffect(() => {
    const checkExistingConnection = async () => {
      try {
        const connected = await isWalletConnected()
        if (connected) {
          const publicKey = await getActivePublicKey()
          if (publicKey) {
            setIsConnected(true)
            setGuardianKey(publicKey)
          }
        }
      } catch (error) {
        console.error("Error checking wallet connection:", error)
      }
    }

    if (typeof window !== 'undefined') {
      const timer = setTimeout(checkExistingConnection, 500)
      return () => clearTimeout(timer)
    }
  }, [])

  // Poll for deploy status
  useEffect(() => {
    if (!deployHash || approvalStatus === "confirmed") return

    const pollStatus = async () => {
      try {
        const result = await getDeployStatus(deployHash)
        if (result.success && result.data) {
          if (result.data.status === "success") {
            setApprovalStatus("confirmed")
          } else if (result.data.status === "failed") {
            setSubmitError("Approval deploy failed on-chain")
            setApprovalStatus("idle")
          }
        }
      } catch (error) {
        console.error("Error polling deploy status:", error)
      }
    }

    const interval = setInterval(pollStatus, 5000)
    return () => clearInterval(interval)
  }, [deployHash, approvalStatus])

  // Animation
  useEffect(() => {
    if (!sectionRef.current || !formRef.current) return

    const ctx = gsap.context(() => {
      gsap.from(formRef.current, {
        y: 60,
        opacity: 0,
        duration: 1.2,
        ease: "power3.out",
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  const handleConnect = async () => {
    setIsConnecting(true)
    setConnectionError(null)

    try {
      if (!isCasperWalletInstalled()) {
        setConnectionError("Casper Wallet extension is not installed")
        window.open("https://www.casperwallet.io/", "_blank")
        return
      }

      const publicKey = await connectWallet()
      if (publicKey) {
        setIsConnected(true)
        setGuardianKey(publicKey)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect wallet"
      setConnectionError(errorMessage)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      const disconnected = await disconnectWallet()
      if (disconnected) {
        setIsConnected(false)
        setGuardianKey("")
        setConnectionError(null)
      }
    } catch (error) {
      console.error("Disconnect error:", error)
    }
  }

  const validateRecoveryId = (value: string): string | null => {
    if (!value.trim()) return null
    // Recovery ID should be a positive integer (U256)
    if (!/^\d+$/.test(value.trim())) {
      return "Recovery ID must be a positive number"
    }
    return null
  }

  const handleApprove = async () => {
    if (!recoveryId.trim()) {
      setSubmitError("Please enter a recovery ID")
      return
    }

    const validationError = validateRecoveryId(recoveryId)
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    setApprovalStatus("pending")

    try {
      // Step 1: Get unsigned deploy from backend
      const approveResult = await approveRecovery(guardianKey, recoveryId.trim())

      if (!approveResult.success || !approveResult.data?.deployJson) {
        throw new Error(approveResult.error || "Failed to build approval deploy")
      }

      // Step 2: Sign the deploy with Casper Wallet
      const provider = getProvider()
      if (!provider) {
        throw new Error("Casper Wallet not available")
      }

      const deployJson = approveResult.data.deployJson
      const deployString = typeof deployJson === 'string' ? deployJson : JSON.stringify(deployJson)

      const response = await provider.sign(deployString, guardianKey)

      if (response.cancelled) {
        throw new Error("Sign request cancelled by user")
      }

      const signatureHex = response.signatureHex
      if (!signatureHex) {
        throw new Error("Failed to get signature from wallet")
      }

      // Reconstruct the deploy
      const originalDeployJson = typeof deployJson === 'string' ? JSON.parse(deployJson) : deployJson
      const deploy = DeployUtil.deployFromJson(originalDeployJson).unwrap()

      // Add signature with algorithm tag
      const publicKey = CLPublicKey.fromHex(guardianKey)
      const algorithmTag = publicKey.isEd25519() ? '01' : '02'
      const fullSignature = algorithmTag + signatureHex

      const approval = new DeployUtil.Approval()
      approval.signer = publicKey.toHex()
      approval.signature = fullSignature
      deploy.approvals.push(approval)

      // Step 3: Submit signed deploy
      const signedDeployJson = DeployUtil.deployToJson(deploy)
      const submitResult = await submitDeploy(JSON.stringify(signedDeployJson))

      if (!submitResult.success) {
        throw new Error(submitResult.error || "Failed to submit deploy")
      }

      setDeployHash(submitResult.data?.deployHash || null)
      setApprovalStatus("submitted")

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to approve recovery"
      setSubmitError(errorMessage)
      setApprovalStatus("idle")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main ref={sectionRef} className="relative min-h-screen">
      <AnimatedNoise opacity={0.03} />

      {/* Navigation */}
      <nav className="relative z-10 border-b border-border/30 px-6 md:px-28 py-6">
        <div className="flex items-center justify-between">
          <a href="/" className="font-[var(--font-bebas)] text-2xl tracking-tight hover:text-accent transition-colors">
            SENTINELX
          </a>
          <div className="flex items-center gap-6">
            <a href="/setup" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Setup
            </a>
            <a href="/recovery" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Recovery
            </a>
            <a href="/execute" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Execute
            </a>
            <a href="/dashboard" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <section className="relative z-10 px-6 md:px-28 py-16 md:py-24">
        <div className="max-w-4xl">
          {/* Header */}
          <div className="mb-16">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Phase 2 / Approval</span>
            <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
              APPROVE RECOVERY
            </h1>
            <p className="mt-6 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
              As a protector, approve a recovery request. Each guardian must independently approve.
              Once threshold is met, the recovery can proceed.
            </p>
          </div>

          {/* Form */}
          <div ref={formRef} className="space-y-12">
            {/* Guardian Key Connection */}
            <div className="border border-border/30 p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">
                    Your Guardian Key
                  </h3>
                  {isConnected ? (
                    <div>
                      <p className="font-mono text-sm text-accent">
                        Connected: {formatPublicKey(guardianKey)}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground mt-1 break-all max-w-md">
                        {guardianKey}
                      </p>
                    </div>
                  ) : (
                    <p className="font-mono text-sm text-muted-foreground">
                      {isConnecting ? "Connecting..." : "Not connected"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isConnected ? (
                    <button
                      onClick={handleDisconnect}
                      className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-red-500 hover:text-red-500 transition-all duration-200"
                    >
                      <ScrambleTextOnHover text="Disconnect" as="span" duration={0.6} />
                    </button>
                  ) : (
                    <button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50"
                    >
                      <ScrambleTextOnHover text={isConnecting ? "Connecting..." : "Connect Wallet"} as="span" duration={0.6} />
                      {!isConnecting && <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />}
                    </button>
                  )}
                </div>
              </div>

              {connectionError && (
                <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                  <p className="font-mono text-xs text-red-500">{connectionError}</p>
                </div>
              )}
            </div>

            {/* Approval Form */}
            {isConnected && approvalStatus === "idle" && (
              <div className="border border-border/30 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-8">
                  Recovery Approval
                </h3>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Recovery ID
                    </label>
                    <input
                      type="text"
                      value={recoveryId}
                      onChange={(e) => {
                        setRecoveryId(e.target.value)
                        setRecoveryIdError(validateRecoveryId(e.target.value))
                      }}
                      placeholder="Enter recovery ID (e.g., 1)"
                      className={`w-full bg-transparent border px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors ${
                        recoveryIdError ? "border-red-500/50" : "border-border/30"
                      }`}
                    />
                    {recoveryIdError && (
                      <p className="font-mono text-xs text-red-500">{recoveryIdError}</p>
                    )}
                    <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                      The recovery ID from the initiation step
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-border/30">
                  {submitError && (
                    <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                      <p className="font-mono text-xs text-red-500">{submitError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleApprove}
                    disabled={!recoveryId.trim() || isSubmitting || !!recoveryIdError}
                    className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ScrambleTextOnHover
                      text={isSubmitting ? "Signing..." : "Approve Recovery"}
                      as="span"
                      duration={0.6}
                    />
                    {!isSubmitting && (
                      <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                    )}
                  </button>
                  <p className="mt-4 font-mono text-xs text-muted-foreground">
                    {isSubmitting ? "Please sign in Casper Wallet..." : "Your approval will be recorded on-chain"}
                  </p>
                </div>
              </div>
            )}

            {/* Approval Status */}
            {(approvalStatus === "submitted" || approvalStatus === "confirmed") && (
              <div className={`border p-6 md:p-8 ${
                approvalStatus === "confirmed" ? "border-green-500/30 bg-green-500/5" : "border-accent/30 bg-accent/5"
              }`}>
                <h3 className={`font-mono text-xs uppercase tracking-widest mb-4 ${
                  approvalStatus === "confirmed" ? "text-green-500" : "text-accent"
                }`}>
                  {approvalStatus === "confirmed" ? "Approval Confirmed ✓" : "Approval Submitted ⏳"}
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-1">
                    <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Recovery ID
                    </span>
                    <span className="font-mono text-xs text-foreground/80">{recoveryId}</span>
                  </div>
                  {deployHash && (
                    <div className="grid grid-cols-1 gap-1">
                      <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                        Deploy Hash
                      </span>
                      <span className="font-mono text-xs text-foreground/80 break-all">{deployHash}</span>
                    </div>
                  )}
                  <div className="pt-4 border-t border-accent/30">
                    <p className="font-mono text-sm text-foreground/80">
                      {approvalStatus === "confirmed"
                        ? "Your approval has been recorded. Other guardians can now approve."
                        : "Waiting for network confirmation..."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Info Panel */}
            <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
              <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                Guardian Approval Process
              </h3>
              <ul className="space-y-3">
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">01</span>
                  <span>Recovery is initiated by the user or a helper</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">02</span>
                  <span>Each guardian independently approves using this page</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">03</span>
                  <span>Contract tracks approval count and weights</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">04</span>
                  <span>Once threshold is met, key rotation can proceed</span>
                </li>
              </ul>
            </div>

            {/* Security Notice */}
            <div className="border border-border/30 p-6 md:p-8">
              <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-4">
                Security Notes
              </h3>
              <ul className="space-y-3">
                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>Only registered guardians can approve recovery requests</span>
                </li>
                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>Each guardian can only approve once per recovery</span>
                </li>
                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>Verify the recovery ID with the account owner before approving</span>
                </li>
                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>Casper runtime enforces all signature requirements</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="relative z-10 px-6 md:px-28 py-8 border-t border-border/30">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            SentinelX v0.1
          </div>
          <div className="flex items-center gap-6">
            <a href="/recovery" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Recovery
            </a>
            <a href="/dashboard" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}

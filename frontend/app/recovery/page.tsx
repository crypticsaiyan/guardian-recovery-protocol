"use client"

import { useState, useRef, useEffect } from "react"
import { AnimatedNoise } from "@/components/animated-noise"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { BitmapChevron } from "@/components/bitmap-chevron"
import { DeployUtil } from "casper-js-sdk"
import {
  connectWallet,
  disconnectWallet,
  isWalletConnected,
  getActivePublicKey,
  formatPublicKey,
  isCasperWalletInstalled,
  getProvider
} from "@/lib/casper-wallet"
import { initiateRecovery, submitDeploy, getDeployStatus } from "@/lib/api"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export default function RecoveryPage() {
  const sectionRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [accountAddress, setAccountAddress] = useState("")
  const [newPublicKey, setNewPublicKey] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [guardianKey, setGuardianKey] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "pending" | "submitted" | "confirmed">("idle")

  // Recovery state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deployHash, setDeployHash] = useState<string | null>(null)
  const [recoveryId, setRecoveryId] = useState<string | null>(null)

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
    if (!deployHash || recoveryStatus === "confirmed") return

    const pollStatus = async () => {
      try {
        const result = await getDeployStatus(deployHash)
        if (result.success && result.data) {
          if (result.data.status === "success") {
            setRecoveryStatus("confirmed")
          } else if (result.data.status === "failed") {
            setSubmitError("Recovery deploy failed on-chain")
            setRecoveryStatus("idle")
          }
        }
      } catch (error) {
        console.error("Error polling deploy status:", error)
      }
    }

    const interval = setInterval(pollStatus, 5000)
    return () => clearInterval(interval)
  }, [deployHash, recoveryStatus])

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

  const handleConnectGuardianKey = async () => {
    setIsConnecting(true)
    setConnectionError(null)

    try {
      if (!isCasperWalletInstalled()) {
        setConnectionError("Casper Wallet extension is not installed. Please install it from casperwallet.io")
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
      console.error("Wallet connection error:", error)
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

  const handleStartRecovery = async () => {
    if (!accountAddress.trim() || !newPublicKey.trim()) {
      setSubmitError("Please fill in all fields")
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    setRecoveryStatus("pending")

    try {
      // Step 1: Get unsigned deploy from backend
      const initiateResult = await initiateRecovery(
        guardianKey,
        accountAddress.trim(),
        newPublicKey.trim()
      )

      if (!initiateResult.success || !initiateResult.data?.deployJson) {
        throw new Error(initiateResult.error || "Failed to build recovery deploy")
      }

      // Step 2: Sign the deploy with Casper Wallet
      const provider = getProvider()
      if (!provider) {
        throw new Error("Casper Wallet not available")
      }

      const unsignedDeploy = DeployUtil.deployFromJson(initiateResult.data.deployJson).unwrap()
      const unsignedDeployJson = DeployUtil.deployToJson(unsignedDeploy)

      const signedJson = await provider.signDeploy(unsignedDeployJson, guardianKey)
      const signedDeploy = DeployUtil.deployFromJson(signedJson).unwrap()

      if (!signedDeploy) {
        throw new Error("Failed to sign deploy")
      }

      // Step 3: Submit signed deploy
      const submitResult = await submitDeploy(JSON.stringify(DeployUtil.deployToJson(signedDeploy)))

      if (!submitResult.success) {
        throw new Error(submitResult.error || "Failed to submit deploy")
      }

      // Store deploy hash and update status
      setDeployHash(submitResult.data?.deployHash || null)
      setRecoveryId(submitResult.data?.deployHash || null) // Using deploy hash as recovery ID for now
      setRecoveryStatus("submitted")

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to start recovery"
      setSubmitError(errorMessage)
      setRecoveryStatus("idle")
      console.error("Recovery error:", error)
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
            GUARDIAN
          </a>
          <div className="flex items-center gap-6">
            <a href="/#how-it-works" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="/setup" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Setup
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
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Phase 2 / Recovery</span>
            <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
              I LOST MY KEY
            </h1>
            <p className="mt-6 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
              Initiate recovery for your account. You will sign with a GUARDIAN key (weight 1) borrowed from a friend.
              Recovery requires all 3 guardian approvals and a 30-day waiting period.
            </p>
          </div>

          {/* Form */}
          <div ref={formRef} className="space-y-12">
            {/* Guardian Key Connection */}
            <div className="border border-border/30 p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">
                    Guardian Key
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
                      onClick={handleConnectGuardianKey}
                      disabled={isConnecting}
                      className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ScrambleTextOnHover text={isConnecting ? "Connecting..." : "Connect Guardian Key"} as="span" duration={0.6} />
                      {!isConnecting && <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Connection Error */}
              {connectionError && (
                <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                  <p className="font-mono text-xs text-red-500">
                    {connectionError}
                  </p>
                </div>
              )}

              {!isConnected && (
                <div className="pt-6 border-t border-border/30">
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                    ⚠ You need to import a guardian key from one of your friends into Casper Wallet before starting recovery.
                  </p>
                </div>
              )}

              {isConnected && (
                <div className="pt-6 border-t border-border/30">
                  <div className="grid grid-cols-1 gap-1 mb-2">
                    <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Status
                    </span>
                    <span className="font-mono text-xs text-foreground/80">
                      Ready to initiate recovery
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Recovery Form */}
            {isConnected && recoveryStatus === "idle" && (
              <div className="border border-border/30 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-8">
                  Recovery Configuration
                </h3>

                <div className="space-y-6">
                  {/* Account Address */}
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Your Account Address
                    </label>
                    <input
                      type="text"
                      value={accountAddress}
                      onChange={(e) => setAccountAddress(e.target.value)}
                      placeholder="Enter your account address..."
                      className="w-full bg-transparent border border-border/30 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                    />
                    <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                      The account you lost access to
                    </p>
                  </div>

                  {/* New Public Key */}
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      New Recovery Key
                    </label>
                    <input
                      type="text"
                      value={newPublicKey}
                      onChange={(e) => setNewPublicKey(e.target.value)}
                      placeholder="Enter your new public key..."
                      className="w-full bg-transparent border border-border/30 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                    />
                    <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                      The new key that will replace your lost primary key
                    </p>
                  </div>
                </div>

                {/* Start Recovery Button */}
                <div className="mt-8 pt-8 border-t border-border/30">
                  {/* Error Display */}
                  {submitError && (
                    <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                      <p className="font-mono text-xs text-red-500">
                        {submitError}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleStartRecovery}
                    disabled={!accountAddress.trim() || !newPublicKey.trim() || isSubmitting}
                    className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-foreground/20 disabled:hover:text-foreground"
                  >
                    <ScrambleTextOnHover
                      text={isSubmitting ? "Signing..." : "Start Recovery"}
                      as="span"
                      duration={0.6}
                    />
                    {!isSubmitting && (
                      <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                    )}
                  </button>
                  <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
                    {isSubmitting
                      ? "Please sign the transaction in Casper Wallet..."
                      : "Casper Wallet will pop up for signature"}
                  </p>
                </div>
              </div>
            )}

            {/* Recovery Submitted Status */}
            {(recoveryStatus === "submitted" || recoveryStatus === "confirmed") && (
              <div className={`border p-6 md:p-8 ${recoveryStatus === "confirmed" ? "border-green-500/30 bg-green-500/5" : "border-accent/30 bg-accent/5"}`}>
                <h3 className={`font-mono text-xs uppercase tracking-widest mb-4 ${recoveryStatus === "confirmed" ? "text-green-500" : "text-accent"}`}>
                  {recoveryStatus === "confirmed" ? "Recovery Confirmed ✓" : "Recovery Initiated ⏳"}
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-1">
                    <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Account
                    </span>
                    <span className="font-mono text-xs text-foreground/80 break-all">
                      {accountAddress}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      New Key
                    </span>
                    <span className="font-mono text-xs text-foreground/80 break-all">
                      {newPublicKey}
                    </span>
                  </div>
                  {deployHash && (
                    <div className="grid grid-cols-1 gap-1">
                      <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                        Deploy Hash
                      </span>
                      <span className="font-mono text-xs text-foreground/80 break-all">
                        {deployHash}
                      </span>
                    </div>
                  )}
                  <div className="pt-4 border-t border-accent/30">
                    <p className="font-mono text-sm text-foreground/80">
                      {recoveryStatus === "confirmed"
                        ? "Recovery proposal is now on-chain. Guardians can start approving."
                        : "Waiting for network confirmation..."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Info Panel */}
            <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
              <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                Recovery Process
              </h3>
              <ul className="space-y-3">
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">01</span>
                  <span>Alice signs recovery request with GUARDIAN key (weight 1)</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">02</span>
                  <span>All 3 friends receive email notifications</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">03</span>
                  <span>Each friend approves (3 signatures: 1+1+1=3 weight)</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">04</span>
                  <span>Wait 30 days for safety period</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">05</span>
                  <span>Backend executes key rotation (no signature needed)</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">06</span>
                  <span>Old key removed, new key added - account recovered!</span>
                </li>
              </ul>
            </div>

            {/* Important Notice */}
            <div className="border border-border/30 p-6 md:p-8">
              <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-4">
                Important Notes
              </h3>
              <ul className="space-y-3">
                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>You must borrow a guardian key from one of your friends to sign this request</span>
                </li>
                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>Guardian key has weight 1 - not enough alone, proves you have guardian access</span>
                </li>
                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>All 3 guardians must approve for recovery to proceed</span>
                </li>
                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>30-day waiting period cannot be bypassed (safety feature)</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Info */}
      <div className="relative z-10 px-6 md:px-28 py-8 border-t border-border/30">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Guardian Recovery Protocol v0.1
          </div>
          <div className="flex items-center gap-6">
            <a href="/#how-it-works" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="/dashboard" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}

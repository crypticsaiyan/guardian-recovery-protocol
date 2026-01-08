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
import { initiateRecovery, submitDeploy, getDeployStatus, getRecoveryById } from "@/lib/api"
import { isValidCasperAddress, getAddressValidationError } from "@/lib/validation"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export default function RecoveryPage() {
  const sectionRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [accountAddress, setAccountAddress] = useState("")
  const [accountAddressError, setAccountAddressError] = useState<string | null>(null)
  const [newPublicKey, setNewPublicKey] = useState("")
  const [newPublicKeyError, setNewPublicKeyError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [guardianKey, setGuardianKey] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "pending" | "submitted" | "confirmed" | "failed">("idle")

  // Recovery state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deployHash, setDeployHash] = useState<string | null>(null)
  const [recoveryId, setRecoveryId] = useState<string | null>(null)

  // Initiated recoveries stored in localStorage
  interface InitiatedRecovery {
    deployHash: string
    recoveryId?: string
    targetAccount: string
    newPublicKey: string
    initiatedAt: string
    deployStatus: 'pending' | 'success' | 'failed'
    approvalCount?: number
    isApproved?: boolean
  }
  const [initiatedRecoveries, setInitiatedRecoveries] = useState<InitiatedRecovery[]>([])

  // Local storage key for this wallet
  const getStorageKey = (walletKey: string) => `sentinelx_recoveries_${walletKey}`

  // Load initiated recoveries from localStorage
  useEffect(() => {
    if (!guardianKey) return

    const storageKey = getStorageKey(guardianKey)
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as InitiatedRecovery[]
        setInitiatedRecoveries(parsed)
      } catch (e) {
        console.error('Failed to parse stored recoveries:', e)
      }
    }
  }, [guardianKey])

  // Poll for status updates on initiated recoveries
  useEffect(() => {
    if (initiatedRecoveries.length === 0) return

    const pollStatuses = async () => {
      let updated = false
      const updatedRecoveries = await Promise.all(
        initiatedRecoveries.map(async (recovery) => {
          // Skip if already finalized
          if (recovery.deployStatus === 'success' || recovery.deployStatus === 'failed') {
            // But still check contract for approval status if we have recoveryId
            if (recovery.recoveryId) {
              try {
                const details = await getRecoveryById(recovery.recoveryId)
                if (details.success && details.data) {
                  return {
                    ...recovery,
                    approvalCount: details.data.approvalCount,
                    isApproved: details.data.isApproved,
                  }
                }
              } catch (e) {
                console.error('Error fetching recovery details:', e)
              }
            }
            return recovery
          }

          // Check deploy status
          try {
            const result = await getDeployStatus(recovery.deployHash)
            if (result.success && result.data) {
              if (result.data.status !== recovery.deployStatus) {
                updated = true
                return {
                  ...recovery,
                  deployStatus: result.data.status,
                }
              }
            }
          } catch (e) {
            console.error('Error polling recovery status:', e)
          }
          return recovery
        })
      )

      if (updated) {
        setInitiatedRecoveries(updatedRecoveries)
        // Save to localStorage
        if (guardianKey) {
          localStorage.setItem(getStorageKey(guardianKey), JSON.stringify(updatedRecoveries))
        }
      }
    }

    pollStatuses()
    const interval = setInterval(pollStatuses, 10000) // Poll every 10 seconds
    return () => clearInterval(interval)
  }, [initiatedRecoveries, guardianKey])

  // Helper to save a new recovery to localStorage
  const saveRecoveryToStorage = (recovery: InitiatedRecovery) => {
    if (!guardianKey) return
    const storageKey = getStorageKey(guardianKey)
    const current = [...initiatedRecoveries, recovery]
    setInitiatedRecoveries(current)
    localStorage.setItem(storageKey, JSON.stringify(current))
  }

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

  // Poll for deploy status - stops when status is final (confirmed or failed)
  useEffect(() => {
    // Only poll if we have a deploy hash and status is "submitted" (waiting for confirmation)
    if (!deployHash || recoveryStatus !== "submitted") return

    const pollStatus = async () => {
      try {
        console.log("Polling deploy status for:", deployHash)
        const result = await getDeployStatus(deployHash)
        console.log("Poll result:", result)

        if (result.success && result.data) {
          if (result.data.status === "success") {
            console.log("Deploy succeeded!")
            setRecoveryStatus("confirmed")
            // Polling will stop because status is no longer "submitted"
          } else if (result.data.status === "failed") {
            console.log("Deploy failed:", result.data.errorMessage)
            setSubmitError(result.data.errorMessage || "Recovery deploy failed on-chain")
            setRecoveryStatus("failed")
            // Polling will stop because status is no longer "submitted"
          }
          // If status is "pending", continue polling
        }
      } catch (error) {
        console.error("Error polling deploy status:", error)
      }
    }

    // Initial poll
    pollStatus()

    // Continue polling every 5 seconds
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

    // Validate addresses before submitting
    if (!isValidCasperAddress(accountAddress.trim())) {
      setSubmitError("Invalid account address format")
      return
    }

    if (!isValidCasperAddress(newPublicKey.trim())) {
      setSubmitError("Invalid new public key format")
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

      // Ensure deployJson is a string for the wallet
      const deployJson = initiateResult.data.deployJson
      const deployString = typeof deployJson === 'string' ? deployJson : JSON.stringify(deployJson)

      // Sign the deploy using Casper Wallet
      const response = await provider.sign(deployString, guardianKey)
      console.log("Recovery sign response:", response)

      if (response.cancelled) {
        throw new Error("Sign request cancelled by user")
      }

      const signatureHex = response.signatureHex
      if (!signatureHex) {
        throw new Error("Failed to get signature from wallet")
      }

      // Reconstruct the deploy from the JSON
      const originalDeployJson = typeof deployJson === 'string' ? JSON.parse(deployJson) : deployJson
      const deploy = DeployUtil.deployFromJson(originalDeployJson).unwrap()

      // Get the public key to determine the signature algorithm
      const publicKey = CLPublicKey.fromHex(guardianKey)

      // Casper Wallet returns the signature without the algorithm tag
      // We need to prepend the tag: 01 for Ed25519, 02 for Secp256k1
      const algorithmTag = publicKey.isEd25519() ? '01' : '02'
      const fullSignature = algorithmTag + signatureHex

      // Create a proper approval with hex strings
      const approval = new DeployUtil.Approval()
      approval.signer = publicKey.toHex()
      approval.signature = fullSignature

      // Add the approval to the deploy
      deploy.approvals.push(approval)

      // Step 3: Submit signed deploy to the network
      const signedDeployJson = DeployUtil.deployToJson(deploy)
      console.log("Recovery deploy approvals count:", deploy.approvals.length)

      const submitResult = await submitDeploy(JSON.stringify(signedDeployJson))
      console.log("Recovery submit result:", submitResult)

      if (!submitResult.success) {
        throw new Error(submitResult.error || "Failed to submit deploy")
      }

      // Store deploy hash and update status
      const newDeployHash = submitResult.data?.deployHash || null
      setDeployHash(newDeployHash)
      setRecoveryId(newDeployHash) // Using deploy hash as recovery ID for now
      setRecoveryStatus("submitted")

      // Save to localStorage for recovery history
      if (newDeployHash) {
        saveRecoveryToStorage({
          deployHash: newDeployHash,
          targetAccount: accountAddress.trim(),
          newPublicKey: newPublicKey.trim(),
          initiatedAt: new Date().toISOString(),
          deployStatus: 'pending',
        })
      }

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
          <a href="/" className="font-[(--font-bebas)] text-2xl tracking-tight hover:text-accent transition-colors">
            SENTINELX
          </a>
          <div className="flex items-center gap-6">
            <a href="/#how-it-works" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="/setup" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Setup
            </a>
            <a href="/approve" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Approve
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
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Phase 2 / Recovery</span>
            <h1 className="mt-4 font-[(--font-bebas)] text-5xl md:text-7xl tracking-tight">
              I LOST MY KEY
            </h1>
            <p className="mt-6 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
              Initiate recovery for your account. You will sign with a PROTECTOR key (weight 1) borrowed from a friend.
              Recovery requires all 3 protector approvals and a 30-day waiting period.
            </p>
          </div>

          {/* Form */}
          <div ref={formRef} className="space-y-12">
            {/* Protector Key Connection */}
            <div className="border border-border/30 p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">
                    Protector Key
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
                      <ScrambleTextOnHover text={isConnecting ? "Connecting..." : "Connect Protector Key"} as="span" duration={0.6} />
                      {!isConnecting && <BitmapChevron className="transition-transform duration-400 ease-in-out group-hover:rotate-45" />}
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
                    ⚠ You need to import a protector key from one of your friends into Casper Wallet before starting recovery.
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
                      onChange={(e) => {
                        setAccountAddress(e.target.value)
                        if (e.target.value.trim()) {
                          setAccountAddressError(getAddressValidationError(e.target.value))
                        } else {
                          setAccountAddressError(null)
                        }
                      }}
                      placeholder="Enter your account address..."
                      className={`w-full bg-transparent border px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors ${accountAddressError ? "border-red-500/50" : "border-border/30"
                        }`}
                    />
                    {accountAddressError && (
                      <p className="font-mono text-xs text-red-500">
                        {accountAddressError}
                      </p>
                    )}
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
                      onChange={(e) => {
                        setNewPublicKey(e.target.value)
                        if (e.target.value.trim()) {
                          setNewPublicKeyError(getAddressValidationError(e.target.value))
                        } else {
                          setNewPublicKeyError(null)
                        }
                      }}
                      placeholder="Enter your new public key..."
                      className={`w-full bg-transparent border px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors ${newPublicKeyError ? "border-red-500/50" : "border-border/30"
                        }`}
                    />
                    {newPublicKeyError && (
                      <p className="font-mono text-xs text-red-500">
                        {newPublicKeyError}
                      </p>
                    )}
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
                    disabled={!accountAddress.trim() || !newPublicKey.trim() || isSubmitting || !!accountAddressError || !!newPublicKeyError}
                    className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-foreground/20 disabled:hover:text-foreground"
                  >
                    <ScrambleTextOnHover
                      text={isSubmitting ? "Signing..." : "Start Recovery"}
                      as="span"
                      duration={0.6}
                    />
                    {!isSubmitting && (
                      <BitmapChevron className="transition-transform duration-400 ease-in-out group-hover:rotate-45" />
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

            {/* Recovery Submitted/Confirmed Status */}
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
                        ? "Recovery proposal is now on-chain. Protectors can start approving."
                        : "Waiting for network confirmation..."}
                    </p>
                    {recoveryStatus === "confirmed" && (
                      <div className="mt-4">
                        <p className="font-mono text-xs text-muted-foreground mb-2">
                          Share this page with your protectors so they can approve:
                        </p>
                        <a
                          href="/approve"
                          className="inline-flex items-center gap-2 font-mono text-xs text-accent hover:underline"
                        >
                          Go to Approval Page →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Recovery Failed Status */}
            {recoveryStatus === "failed" && (
              <div className="border border-red-500/30 bg-red-500/5 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest mb-4 text-red-500">
                  Recovery Failed ✗
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
                  {submitError && (
                    <div className="p-4 border border-red-500/30 bg-red-500/10 rounded">
                      <p className="font-mono text-xs text-red-400">
                        <strong>Error:</strong> {submitError}
                      </p>
                    </div>
                  )}
                  <div className="pt-4 border-t border-red-500/30">
                    <p className="font-mono text-sm text-foreground/80 mb-4">
                      The recovery deploy failed on-chain. This could be due to:
                    </p>
                    <ul className="space-y-2 mb-4">
                      <li className="font-mono text-xs text-muted-foreground">
                        • Account not initialized with guardians in the contract
                      </li>
                      <li className="font-mono text-xs text-muted-foreground">
                        • Invalid account or key format
                      </li>
                      <li className="font-mono text-xs text-muted-foreground">
                        • Insufficient gas for the transaction
                      </li>
                    </ul>
                    <button
                      onClick={() => {
                        setRecoveryStatus("idle")
                        setSubmitError(null)
                        setDeployHash(null)
                      }}
                      className="inline-flex items-center gap-2 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* My Initiated Recoveries */}
            {isConnected && (
              <div className="border border-border/30 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-6">
                  My Initiated Recoveries
                </h3>

                {initiatedRecoveries.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 mx-auto rounded-full border-2 border-dashed border-muted-foreground/30 mb-4 flex items-center justify-center">
                      <span className="text-muted-foreground/50 text-2xl">∅</span>
                    </div>
                    <p className="font-mono text-sm text-muted-foreground">
                      No recoveries initiated from this wallet yet
                    </p>
                    <p className="font-mono text-xs text-muted-foreground/60 mt-2">
                      Initiate a recovery above to see it listed here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {initiatedRecoveries.map((recovery, index) => (
                      <div
                        key={recovery.deployHash}
                        className="border border-border/20 p-4 bg-background/50"
                      >
                        {/* Status Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            {/* Status Indicator Light */}
                            <div
                              className={`w-3 h-3 rounded-full ${recovery.deployStatus === 'pending'
                                ? 'bg-yellow-400 animate-pulse shadow-[0_0_10px_2px_rgba(250,204,21,0.5)]'
                                : recovery.deployStatus === 'success'
                                  ? 'bg-green-500 animate-[glow_1.5s_ease-in-out_infinite] shadow-[0_0_12px_3px_rgba(34,197,94,0.6)]'
                                  : 'bg-red-500 opacity-50'
                                }`}
                              title={`Deploy Status: ${recovery.deployStatus}`}
                            />
                            <span className="font-mono text-xs uppercase tracking-widest text-foreground">
                              Recovery #{index + 1}
                            </span>
                          </div>
                          <span
                            className={`font-mono text-xs uppercase px-2 py-1 ${recovery.deployStatus === 'pending'
                              ? 'text-yellow-400 bg-yellow-400/10'
                              : recovery.deployStatus === 'success'
                                ? 'text-green-500 bg-green-500/10'
                                : 'text-red-500 bg-red-500/10'
                              }`}
                          >
                            {recovery.deployStatus}
                          </span>
                        </div>

                        {/* Recovery Details */}
                        <div className="space-y-3">
                          {/* Deploy Hash */}
                          <div className="grid grid-cols-1 gap-1">
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              Deploy Hash
                            </span>
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-xs text-foreground/80 break-all bg-muted/30 px-2 py-1 flex-1">
                                {recovery.deployHash}
                              </code>
                              <button
                                onClick={() => navigator.clipboard.writeText(recovery.deployHash)}
                                className="font-mono text-[10px] text-accent hover:text-accent/80 transition-colors shrink-0"
                                title="Copy to clipboard"
                              >
                                COPY
                              </button>
                            </div>
                          </div>

                          {/* Recovery ID (for guardians) */}
                          {recovery.recoveryId && (
                            <div className="grid grid-cols-1 gap-1">
                              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                Recovery ID (for Guardian Approval)
                              </span>
                              <div className="flex items-center gap-2">
                                <code className="font-mono text-xs text-accent break-all bg-accent/10 px-2 py-1 flex-1">
                                  {recovery.recoveryId}
                                </code>
                                <button
                                  onClick={() => navigator.clipboard.writeText(recovery.recoveryId!)}
                                  className="font-mono text-[10px] text-accent hover:text-accent/80 transition-colors shrink-0"
                                  title="Copy to clipboard"
                                >
                                  COPY
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Target Account */}
                          <div className="grid grid-cols-1 gap-1">
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              Target Account
                            </span>
                            <span className="font-mono text-xs text-foreground/70 break-all">
                              {recovery.targetAccount}
                            </span>
                          </div>

                          {/* Approval Status (if available) */}
                          {recovery.approvalCount !== undefined && (
                            <div className="flex items-center gap-4 pt-2 border-t border-border/20">
                              <div>
                                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Approvals
                                </span>
                                <span className="font-mono text-sm text-foreground ml-2">
                                  {recovery.approvalCount}
                                </span>
                              </div>
                              {recovery.isApproved && (
                                <span className="font-mono text-xs text-green-500 bg-green-500/10 px-2 py-1">
                                  ✓ THRESHOLD MET
                                </span>
                              )}
                            </div>
                          )}

                          {/* Initiated Timestamp */}
                          <div className="pt-2 border-t border-border/20">
                            <span className="font-mono text-[10px] text-muted-foreground/60">
                              Initiated: {new Date(recovery.initiatedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer Info */}
      <div className="relative z-10 px-6 md:px-28 py-8 border-t border-border/30">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            SentinelX v0.1
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

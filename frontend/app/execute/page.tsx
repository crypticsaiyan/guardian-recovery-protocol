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
import { 
  buildAddKeyDeploy, 
  buildRemoveKeyDeploy, 
  buildUpdateThresholdsDeploy,
  submitDeploy, 
  getDeployStatus 
} from "@/lib/api"
import { isValidCasperAddress, getAddressValidationError } from "@/lib/validation"
import gsap from "gsap"

type ExecutionStep = "add_key" | "remove_key" | "update_thresholds" | "complete"

export default function ExecutePage() {
  const sectionRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  
  // Wallet state
  const [isConnected, setIsConnected] = useState(false)
  const [guardianKey, setGuardianKey] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  
  // Form state
  const [newPublicKey, setNewPublicKey] = useState("")
  const [newKeyError, setNewKeyError] = useState<string | null>(null)
  const [oldPublicKey, setOldPublicKey] = useState("")
  const [oldKeyError, setOldKeyError] = useState<string | null>(null)

  // Execution state
  const [currentStep, setCurrentStep] = useState<ExecutionStep>("add_key")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deployHash, setDeployHash] = useState<string | null>(null)
  const [stepStatus, setStepStatus] = useState<"idle" | "pending" | "submitted" | "confirmed">("idle")

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
    if (!deployHash || stepStatus === "confirmed") return

    const pollStatus = async () => {
      try {
        const result = await getDeployStatus(deployHash)
        if (result.success && result.data) {
          if (result.data.status === "success") {
            setStepStatus("confirmed")
          } else if (result.data.status === "failed") {
            setSubmitError("Deploy failed on-chain")
            setStepStatus("idle")
          }
        }
      } catch (error) {
        console.error("Error polling deploy status:", error)
      }
    }

    const interval = setInterval(pollStatus, 5000)
    return () => clearInterval(interval)
  }, [deployHash, stepStatus])

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

  const signAndSubmitDeploy = async (deployJson: any): Promise<string> => {
    const provider = getProvider()
    if (!provider) throw new Error("Casper Wallet not available")

    const deployString = typeof deployJson === 'string' ? deployJson : JSON.stringify(deployJson)
    const response = await provider.sign(deployString, guardianKey)

    if (response.cancelled) throw new Error("Sign request cancelled by user")
    if (!response.signatureHex) throw new Error("Failed to get signature from wallet")

    const originalDeployJson = typeof deployJson === 'string' ? JSON.parse(deployJson) : deployJson
    const deploy = DeployUtil.deployFromJson(originalDeployJson).unwrap()

    const publicKey = CLPublicKey.fromHex(guardianKey)
    const algorithmTag = publicKey.isEd25519() ? '01' : '02'
    const fullSignature = algorithmTag + response.signatureHex

    const approval = new DeployUtil.Approval()
    approval.signer = publicKey.toHex()
    approval.signature = fullSignature
    deploy.approvals.push(approval)

    const signedDeployJson = DeployUtil.deployToJson(deploy)
    const submitResult = await submitDeploy(JSON.stringify(signedDeployJson))

    if (!submitResult.success) throw new Error(submitResult.error || "Failed to submit deploy")
    return submitResult.data?.deployHash || ""
  }

  const handleAddKey = async () => {
    if (!newPublicKey.trim()) {
      setSubmitError("Please enter the new public key")
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    setStepStatus("pending")

    try {
      const result = await buildAddKeyDeploy(guardianKey, newPublicKey.trim(), 1)
      if (!result.success || !result.data?.deployJson) {
        throw new Error(result.error || "Failed to build add key deploy")
      }

      const hash = await signAndSubmitDeploy(result.data.deployJson)
      setDeployHash(hash)
      setStepStatus("submitted")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to add key"
      setSubmitError(errorMessage)
      setStepStatus("idle")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveKey = async () => {
    if (!oldPublicKey.trim()) {
      setSubmitError("Please enter the old public key to remove")
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    setStepStatus("pending")

    try {
      const result = await buildRemoveKeyDeploy(guardianKey, oldPublicKey.trim())
      if (!result.success || !result.data?.deployJson) {
        throw new Error(result.error || "Failed to build remove key deploy")
      }

      const hash = await signAndSubmitDeploy(result.data.deployJson)
      setDeployHash(hash)
      setStepStatus("submitted")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to remove key"
      setSubmitError(errorMessage)
      setStepStatus("idle")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateThresholds = async () => {
    setIsSubmitting(true)
    setSubmitError(null)
    setStepStatus("pending")

    try {
      const result = await buildUpdateThresholdsDeploy(guardianKey, 1, 1)
      if (!result.success || !result.data?.deployJson) {
        throw new Error(result.error || "Failed to build update thresholds deploy")
      }

      const hash = await signAndSubmitDeploy(result.data.deployJson)
      setDeployHash(hash)
      setStepStatus("submitted")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update thresholds"
      setSubmitError(errorMessage)
      setStepStatus("idle")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNextStep = () => {
    setStepStatus("idle")
    setDeployHash(null)
    setSubmitError(null)
    
    if (currentStep === "add_key") setCurrentStep("remove_key")
    else if (currentStep === "remove_key") setCurrentStep("update_thresholds")
    else if (currentStep === "update_thresholds") setCurrentStep("complete")
  }

  const getStepTitle = () => {
    switch (currentStep) {
      case "add_key": return "Step 1: Add New Key"
      case "remove_key": return "Step 2: Remove Old Key"
      case "update_thresholds": return "Step 3: Reset Thresholds"
      case "complete": return "Recovery Complete!"
    }
  }

  const getStepDescription = () => {
    switch (currentStep) {
      case "add_key": return "Add the new recovery key to the account with weight 1"
      case "remove_key": return "Remove the lost/compromised key from the account"
      case "update_thresholds": return "Reset thresholds to 1 so user regains full control"
      case "complete": return "The account has been successfully recovered"
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
            <a href="/approve" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Approve
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
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Phase 3 / Execution</span>
            <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
              EXECUTE RECOVERY
            </h1>
            <p className="mt-6 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
              Once threshold is met, guardians jointly execute the key rotation.
              This requires multiple guardian signatures meeting the key management threshold.
            </p>
          </div>

          {/* Progress Indicator */}
          <div className="mb-12 flex items-center gap-4">
            {["add_key", "remove_key", "update_thresholds", "complete"].map((step, idx) => (
              <div key={step} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs ${
                  currentStep === step ? "bg-accent text-background" :
                  ["add_key", "remove_key", "update_thresholds", "complete"].indexOf(currentStep) > idx 
                    ? "bg-green-500 text-background" : "border border-border/30 text-muted-foreground"
                }`}>
                  {["add_key", "remove_key", "update_thresholds", "complete"].indexOf(currentStep) > idx ? "✓" : idx + 1}
                </div>
                {idx < 3 && <div className="w-12 h-px bg-border/30" />}
              </div>
            ))}
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
                    <p className="font-mono text-sm text-accent">
                      Connected: {formatPublicKey(guardianKey)}
                    </p>
                  ) : (
                    <p className="font-mono text-sm text-muted-foreground">
                      {isConnecting ? "Connecting..." : "Not connected"}
                    </p>
                  )}
                </div>
                {isConnected ? (
                  <button onClick={handleDisconnect} className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-red-500 hover:text-red-500 transition-all duration-200">
                    <ScrambleTextOnHover text="Disconnect" as="span" duration={0.6} />
                  </button>
                ) : (
                  <button onClick={handleConnect} disabled={isConnecting} className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50">
                    <ScrambleTextOnHover text={isConnecting ? "Connecting..." : "Connect Wallet"} as="span" duration={0.6} />
                    {!isConnecting && <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />}
                  </button>
                )}
              </div>
              {connectionError && (
                <div className="p-4 border border-red-500/30 bg-red-500/5">
                  <p className="font-mono text-xs text-red-500">{connectionError}</p>
                </div>
              )}
            </div>

            {/* Current Step */}
            {isConnected && currentStep !== "complete" && (
              <div className="border border-border/30 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">
                  {getStepTitle()}
                </h3>
                <p className="font-mono text-sm text-muted-foreground mb-8">
                  {getStepDescription()}
                </p>

                {/* Step-specific inputs */}
                {currentStep === "add_key" && stepStatus === "idle" && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                        New Public Key
                      </label>
                      <input
                        type="text"
                        value={newPublicKey}
                        onChange={(e) => {
                          setNewPublicKey(e.target.value)
                          setNewKeyError(e.target.value.trim() ? getAddressValidationError(e.target.value) : null)
                        }}
                        placeholder="Enter the new recovery key..."
                        className={`w-full bg-transparent border px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors ${newKeyError ? "border-red-500/50" : "border-border/30"}`}
                      />
                      {newKeyError && <p className="font-mono text-xs text-red-500">{newKeyError}</p>}
                    </div>
                  </div>
                )}

                {currentStep === "remove_key" && stepStatus === "idle" && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                        Old Public Key to Remove
                      </label>
                      <input
                        type="text"
                        value={oldPublicKey}
                        onChange={(e) => {
                          setOldPublicKey(e.target.value)
                          setOldKeyError(e.target.value.trim() ? getAddressValidationError(e.target.value) : null)
                        }}
                        placeholder="Enter the lost/compromised key..."
                        className={`w-full bg-transparent border px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors ${oldKeyError ? "border-red-500/50" : "border-border/30"}`}
                      />
                      {oldKeyError && <p className="font-mono text-xs text-red-500">{oldKeyError}</p>}
                    </div>
                  </div>
                )}

                {/* Status Display */}
                {(stepStatus === "submitted" || stepStatus === "confirmed") && (
                  <div className={`p-4 border ${stepStatus === "confirmed" ? "border-green-500/30 bg-green-500/5" : "border-accent/30 bg-accent/5"}`}>
                    <p className={`font-mono text-xs ${stepStatus === "confirmed" ? "text-green-500" : "text-accent"}`}>
                      {stepStatus === "confirmed" ? "Step completed successfully ✓" : "Waiting for confirmation..."}
                    </p>
                    {deployHash && (
                      <p className="font-mono text-xs text-muted-foreground mt-2 break-all">
                        Deploy: {deployHash}
                      </p>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-8 pt-8 border-t border-border/30">
                  {submitError && (
                    <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                      <p className="font-mono text-xs text-red-500">{submitError}</p>
                    </div>
                  )}

                  {stepStatus === "idle" && (
                    <button
                      onClick={currentStep === "add_key" ? handleAddKey : currentStep === "remove_key" ? handleRemoveKey : handleUpdateThresholds}
                      disabled={isSubmitting || (currentStep === "add_key" && (!newPublicKey.trim() || !!newKeyError)) || (currentStep === "remove_key" && (!oldPublicKey.trim() || !!oldKeyError))}
                      className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ScrambleTextOnHover text={isSubmitting ? "Signing..." : "Execute Step"} as="span" duration={0.6} />
                      {!isSubmitting && <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />}
                    </button>
                  )}

                  {stepStatus === "confirmed" && (
                    <button
                      onClick={handleNextStep}
                      className="group inline-flex items-center gap-3 border border-green-500/50 px-8 py-4 font-mono text-xs uppercase tracking-widest text-green-500 hover:border-green-400 hover:text-green-400 transition-all duration-200"
                    >
                      <ScrambleTextOnHover text="Continue to Next Step" as="span" duration={0.6} />
                      <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Complete State */}
            {currentStep === "complete" && (
              <div className="border border-green-500/30 bg-green-500/5 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-green-500 mb-4">
                  Recovery Complete! 🎉
                </h3>
                <p className="font-mono text-sm text-foreground/80 mb-6">
                  The account has been successfully recovered. The new key now has full control.
                </p>
                <ul className="space-y-2">
                  <li className="font-mono text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-green-500">✓</span> New key added with weight 1
                  </li>
                  <li className="font-mono text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-green-500">✓</span> Old key removed
                  </li>
                  <li className="font-mono text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-green-500">✓</span> Thresholds reset to 1
                  </li>
                </ul>
              </div>
            )}

            {/* Info Panel */}
            <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
              <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                Execution Requirements
              </h3>
              <ul className="space-y-3">
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>Requires key_management_threshold signatures (usually 2+)</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>Multiple guardians must sign each deploy</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>Casper runtime enforces signature requirements</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">•</span>
                  <span>Each step must complete before proceeding</span>
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
            <a href="/approve" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Approve
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}

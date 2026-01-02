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
import { registerGuardians, submitDeploy, getDeployStatus } from "@/lib/api"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export default function SetupPage() {
  const sectionRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [guardians, setGuardians] = useState(["", ""])
  const [isConnected, setIsConnected] = useState(false)
  const [account, setAccount] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const minGuardians = 2

  // Guardian registration state
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [deployHash, setDeployHash] = useState<string | null>(null)
  const [deployStatus, setDeployStatus] = useState<"pending" | "success" | "failed" | null>(null)

  // Check if wallet is already connected on mount
  useEffect(() => {
    const checkExistingConnection = async () => {
      try {
        const connected = await isWalletConnected()
        if (connected) {
          const publicKey = await getActivePublicKey()
          if (publicKey) {
            setIsConnected(true)
            setAccount(publicKey)
          }
        }
      } catch (error) {
        console.error("Error checking wallet connection:", error)
      }
    }

    // Only run on client side
    if (typeof window !== 'undefined') {
      // Small delay to ensure Casper Wallet injection
      const timer = setTimeout(checkExistingConnection, 500)
      return () => clearTimeout(timer)
    }
  }, [])

  // Poll for deploy status when we have a deploy hash
  useEffect(() => {
    if (!deployHash || deployStatus === "success" || deployStatus === "failed") return

    const pollStatus = async () => {
      try {
        const result = await getDeployStatus(deployHash)
        if (result.success && result.data) {
          if (result.data.status === "success") {
            setDeployStatus("success")
            setSaveSuccess(true)
          } else if (result.data.status === "failed") {
            setDeployStatus("failed")
            setSaveError("Deploy failed on-chain")
          }
        }
      } catch (error) {
        console.error("Error polling deploy status:", error)
      }
    }

    const interval = setInterval(pollStatus, 5000)
    return () => clearInterval(interval)
  }, [deployHash, deployStatus])

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

  const handleGuardianChange = (index: number, value: string) => {
    const newGuardians = [...guardians]
    newGuardians[index] = value
    setGuardians(newGuardians)
  }

  const handleAddGuardian = () => {
    setGuardians([...guardians, ""])
  }

  const handleRemoveGuardian = (index: number) => {
    if (guardians.length > minGuardians) {
      const newGuardians = guardians.filter((_, i) => i !== index)
      setGuardians(newGuardians)
    }
  }

  const handleConnectWallet = async () => {
    setIsConnecting(true)
    setConnectionError(null)

    try {
      // Check if Casper Wallet is installed
      if (!isCasperWalletInstalled()) {
        setConnectionError("Casper Wallet extension is not installed. Please install it from casperwallet.io")
        window.open("https://www.casperwallet.io/", "_blank")
        return
      }

      const publicKey = await connectWallet()

      if (publicKey) {
        setIsConnected(true)
        setAccount(publicKey)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect wallet"
      setConnectionError(errorMessage)
      console.error("Wallet connection error:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnectWallet = async () => {
    try {
      const disconnected = await disconnectWallet()
      if (disconnected) {
        setIsConnected(false)
        setAccount("")
        setConnectionError(null)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to disconnect wallet"
      setConnectionError(errorMessage)
      console.error("Wallet disconnect error:", error)
    }
  }

  const handleSaveGuardians = async () => {
    // Validate guardians
    const validGuardians = guardians.filter(g => g.trim())
    if (validGuardians.length < minGuardians) {
      setSaveError(`At least ${minGuardians} guardians are required`)
      return
    }

    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    setDeployHash(null)
    setDeployStatus(null)

    try {
      // Step 1: Get unsigned deploy from backend
      const threshold = validGuardians.length // All guardians must approve
      const registerResult = await registerGuardians(account, validGuardians, threshold)

      if (!registerResult.success || !registerResult.data?.deployJson) {
        throw new Error(registerResult.error || "Failed to build registration deploy")
      }

      // Step 2: Sign the deploy with Casper Wallet
      const provider = getProvider()
      if (!provider) {
        throw new Error("Casper Wallet not available")
      }

      // Parse the deploy JSON
      const deployJson = registerResult.data.deployJson

      // Sign the deploy using Casper Wallet
      const signedDeploy = await provider.signDeploy(deployJson, account)

      if (!signedDeploy) {
        throw new Error("Failed to sign deploy")
      }

      // Step 3: Submit signed deploy to the network
      const submitResult = await submitDeploy(JSON.stringify(signedDeploy.deploy))

      if (!submitResult.success) {
        throw new Error(submitResult.error || "Failed to submit deploy")
      }

      // Store deploy hash and start polling
      setDeployHash(submitResult.data?.deployHash || null)
      setDeployStatus("pending")

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save guardians"
      setSaveError(errorMessage)
      console.error("Save guardians error:", error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main ref={sectionRef} className="relative min-h-screen">
      <AnimatedNoise opacity={0.03} />

      {/* Navigation */}
      <nav className="relative z-10 border-b border-border/30 px-6 md:px-28 py-6">
        <div className="flex items-center justify-between">
          <a href="/" className="font-[(--font-bebas)] text-2xl tracking-tight hover:text-accent transition-colors">
            GUARDIAN
          </a>
          <div className="flex items-center gap-6">
            <a href="/#how-it-works" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="/recovery" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Recovery
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
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Phase 1 / Setup</span>
            <h1 className="mt-4 font-[--font-bebas] text-5xl md:text-7xl tracking-tight">
              SETUP GUARDIANS
            </h1>
            <p className="mt-6 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
              Enter guardian public keys (minimum 2). You will sign this transaction with your PRIMARY key (weight 3).
              Guardians will be stored on-chain.
            </p>
          </div>

          {/* Connection Status */}
          <div ref={formRef} className="space-y-12">
            <div className="border border-border/30 p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">
                    Wallet Connection
                  </h3>
                  {isConnected ? (
                    <div>
                      <p className="font-mono text-sm text-accent">
                        Connected: {formatPublicKey(account)}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground mt-1 break-all max-w-md">
                        {account}
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
                      onClick={handleDisconnectWallet}
                      className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-red-500 hover:text-red-500 transition-all duration-200"
                    >
                      <ScrambleTextOnHover text="Disconnect" as="span" duration={0.6} />
                    </button>
                  ) : (
                    <button
                      onClick={handleConnectWallet}
                      disabled={isConnecting}
                      className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ScrambleTextOnHover text={isConnecting ? "Connecting..." : "Connect Wallet"} as="span" duration={0.6} />
                      {!isConnecting && <BitmapChevron className="transition-transform duration-400 ease-in-out group-hover:rotate-45" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {connectionError && (
                <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                  <p className="font-mono text-xs text-red-500">
                    {connectionError}
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
                      Ready to setup guardians
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Guardian Form */}
            {isConnected && (
              <div className="border border-border/30 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-8">
                  Guardian Configuration
                </h3>

                <div className="space-y-6">
                  {/* Guardian Inputs */}
                  {guardians.map((guardian, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                          Guardian {index + 1} Public Key
                        </label>
                        {guardians.length > minGuardians && (
                          <button
                            onClick={() => handleRemoveGuardian(index)}
                            className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={guardian}
                        onChange={(e) => handleGuardianChange(index, e.target.value)}
                        placeholder="Enter guardian public key..."
                        className="w-full bg-transparent border border-border/30 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                      />
                    </div>
                  ))}

                  {/* Add Guardian Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleAddGuardian}
                      className="inline-flex items-center gap-3 border border-border/30 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200"
                    >
                      <span className="text-accent">+</span>
                      Add Guardian
                    </button>
                    <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
                      All guardians must approve for recovery (threshold = {guardians.length})
                    </p>
                  </div>
                </div>

                {/* Save Button */}
                <div className="mt-8 pt-8 border-t border-border/30">
                  {/* Error Display */}
                  {saveError && (
                    <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                      <p className="font-mono text-xs text-red-500">
                        {saveError}
                      </p>
                    </div>
                  )}

                  {/* Success Display */}
                  {saveSuccess && deployHash && (
                    <div className="mb-6 p-4 border border-green-500/30 bg-green-500/5">
                      <p className="font-mono text-xs text-green-500 mb-2">
                        ✓ Guardians registered successfully!
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground break-all">
                        Deploy Hash: {deployHash}
                      </p>
                    </div>
                  )}

                  {/* Pending Status */}
                  {deployStatus === "pending" && deployHash && !saveSuccess && (
                    <div className="mb-6 p-4 border border-yellow-500/30 bg-yellow-500/5">
                      <p className="font-mono text-xs text-yellow-500 mb-2">
                        ⏳ Deploy submitted, waiting for confirmation...
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground break-all">
                        Deploy Hash: {deployHash}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleSaveGuardians}
                    disabled={guardians.some((g) => !g.trim()) || isSaving || saveSuccess}
                    className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-foreground/20 disabled:hover:text-foreground"
                  >
                    <ScrambleTextOnHover
                      text={isSaving ? "Signing..." : saveSuccess ? "Saved ✓" : "Save Guardians"}
                      as="span"
                      duration={0.6}
                    />
                    {!isSaving && !saveSuccess && (
                      <BitmapChevron className="transition-transform duration-400 ease-in-out group-hover:rotate-45" />
                    )}
                  </button>
                  <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
                    {isSaving
                      ? "Please sign the transaction in Casper Wallet..."
                      : saveSuccess
                        ? "Your guardians are now registered on-chain"
                        : "Casper Wallet will pop up for signature"}
                  </p>
                </div>
              </div>
            )}

            {/* Info Panel */}
            <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
              <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                What Happens Next?
              </h3>
              <ul className="space-y-3">
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">01</span>
                  <span>Casper Wallet will request your signature</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">02</span>
                  <span>You sign with your PRIMARY key (weight 3)</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">03</span>
                  <span>Guardians are stored on-chain</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">04</span>
                  <span>Friends receive notification</span>
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
            <a href="/#key-features" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}

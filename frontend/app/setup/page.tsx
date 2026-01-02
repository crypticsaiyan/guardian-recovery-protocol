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
import { registerGuardians, submitDeploy, getDeployStatus, getGuardians, hasGuardians } from "@/lib/api"
import { isValidCasperAddress, getAddressValidationError } from "@/lib/validation"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export default function SetupPage() {
  const sectionRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [guardians, setGuardians] = useState(["", ""])
  const [guardianErrors, setGuardianErrors] = useState<(string | null)[]>(["", ""])
  const [isConnected, setIsConnected] = useState(false)
  const [account, setAccount] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const minGuardians = 2

  // Protector registration state
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [deployHash, setDeployHash] = useState<string | null>(null)
  const [deployStatus, setDeployStatus] = useState<"pending" | "success" | "failed" | null>(null)
  const [registeredGuardians, setRegisteredGuardians] = useState<string[]>([])
  const [isLoadingGuardians, setIsLoadingGuardians] = useState(false)

  // Load guardians from localStorage when account connects
  useEffect(() => {
    if (account) {
      const storageKey = `guardians_${account}`
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try {
          const guardians = JSON.parse(stored)
          if (Array.isArray(guardians) && guardians.length > 0) {
            setRegisteredGuardians(guardians)
            setSaveSuccess(true)
          }
        } catch (error) {
          console.error('Error parsing stored guardians:', error)
        }
      }
    }
  }, [account])

  // Fetch existing guardians when connected
  useEffect(() => {
    const fetchExistingGuardians = async () => {
      if (!account) return
      
      // Check if we already have guardians in localStorage
      const storageKey = `guardians_${account}`
      if (localStorage.getItem(storageKey)) {
        return // Already loaded from localStorage
      }
      
      setIsLoadingGuardians(true)
      try {
        // Use hasGuardians to check if guardians are registered
        // We can't actually fetch the guardian list via deploy result
        // So we'll just check if they exist
        const result = await hasGuardians(account, account)
        if (result.success && result.data?.deployJson) {
          const provider = await getProvider()
          if (!provider) {
            setIsLoadingGuardians(false)
            return
          }

          // Parse and sign the deploy
          const deployJson = result.data.deployJson
          const deployString = typeof deployJson === 'string' ? deployJson : JSON.stringify(deployJson)
          
          const response = await provider.sign(deployString, account)
          if (response.cancelled) {
            setIsLoadingGuardians(false)
            return
          }

          const signatureHex = response.signatureHex
          if (!signatureHex) {
            setIsLoadingGuardians(false)
            return
          }

          // Reconstruct and sign the deploy
          const originalDeployJson = typeof deployJson === 'string' ? JSON.parse(deployJson) : deployJson
          const deploy = DeployUtil.deployFromJson(originalDeployJson).unwrap()

          const publicKey = CLPublicKey.fromHex(account)
          const tag = publicKey.tag
          const tagHex = tag.toString(16).padStart(2, '0')
          const signatureWithTag = tagHex + signatureHex

          const approval = new DeployUtil.Approval()
          approval.signer = account
          approval.signature = signatureWithTag
          deploy.approvals.push(approval)

          // Submit the signed deploy
          const signedDeployJson = DeployUtil.deployToJson(deploy)
          const submitResult = await submitDeploy(JSON.stringify(signedDeployJson))
          
          if (submitResult.success && submitResult.data?.deployHash) {
            // Poll for result - if successful, guardians exist
            const pollForResult = async (hash: string) => {
              for (let i = 0; i < 15; i++) {
                await new Promise(resolve => setTimeout(resolve, 3000))
                const statusResult = await getDeployStatus(hash)
                
                if (statusResult.success && statusResult.data) {
                  const deployData = statusResult.data
                  // Check execution_results
                  if (deployData[1]?.execution_results?.[0]?.result?.Success) {
                    // Guardians exist - show a message that they're registered
                    // Since we can't fetch the actual guardian addresses from session WASM,
                    // we'll just indicate that guardians are already configured
                    setSaveSuccess(true)
                    // Set a placeholder to indicate guardians exist but we can't fetch them
                    setRegisteredGuardians(["Protectors already configured for this account"])
                    break
                  } else if (deployData[1]?.execution_results?.[0]?.result?.Failure) {
                    // No guardians or error
                    break
                  }
                }
              }
            }

            await pollForResult(submitResult.data.deployHash)
          }
        }
      } catch (error) {
        console.error("Error checking guardians:", error)
        // Silently fail - user might not have guardians registered yet
      } finally {
        setIsLoadingGuardians(false)
      }
    }

    if (account) {
      fetchExistingGuardians()
    }
  }, [account])

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
    
    // Validate on change
    const newErrors = [...guardianErrors]
    if (value.trim()) {
      const addressError = getAddressValidationError(value)
      if (addressError) {
        newErrors[index] = addressError
      } else if (account && value.trim().toLowerCase() === account.toLowerCase()) {
        newErrors[index] = "Cannot use your own account as a protector"
      } else {
        newErrors[index] = null
      }
    } else {
      newErrors[index] = null
    }
    setGuardianErrors(newErrors)
  }

  const handleAddGuardian = () => {
    setGuardians([...guardians, ""])
    setGuardianErrors([...guardianErrors, null])
  }

  const handleRemoveGuardian = (index: number) => {
    if (guardians.length > minGuardians) {
      const newGuardians = guardians.filter((_, i) => i !== index)
      setGuardians(newGuardians)
      const newErrors = guardianErrors.filter((_, i) => i !== index)
      setGuardianErrors(newErrors)
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
      setSaveError(`At least ${minGuardians} protectors are required`)
      return
    }
    
    // Check all guardians are valid addresses
    const invalidGuardians = validGuardians.filter(g => !isValidCasperAddress(g))
    if (invalidGuardians.length > 0) {
      setSaveError(`Invalid protector addresses. Please check all entries.`)
      return
    }
    
    // Check that no guardian is the same as the user account
    const selfAsGuardian = validGuardians.some(g => g.trim().toLowerCase() === account.toLowerCase())
    if (selfAsGuardian) {
      setSaveError(`You cannot add yourself as a protector. Protectors must be different accounts.`)
      return
    }
    
    // Check for duplicate guardians
    const uniqueGuardians = new Set(validGuardians.map(g => g.trim().toLowerCase()))
    if (uniqueGuardians.size !== validGuardians.length) {
      setSaveError(`Duplicate protector addresses detected. Each protector must be unique.`)
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

      // Ensure deployJson is a string for the wallet
      const deployString = typeof deployJson === 'string' ? deployJson : JSON.stringify(deployJson);

      // Sign the deploy using Casper Wallet
      // Note: The method is 'sign' in the wallet provider, not 'signDeploy'
      const response = await provider.sign(deployString, account)
      console.log("Sign response:", response);

      if (response.cancelled) {
        throw new Error("Sign request cancelled by user")
      }

      const signatureHex = response.signatureHex;
      if (!signatureHex) {
        throw new Error("Failed to get signature from wallet")
      }

      // Reconstruct the deploy from the JSON
      // We use the original object, not the string
      const originalDeployJson = typeof deployJson === 'string' ? JSON.parse(deployJson) : deployJson;
      const deploy = DeployUtil.deployFromJson(originalDeployJson).unwrap();

      // Construct the signature with the correct tag
      // Casper Wallet returns raw signature bytes (hex)
      // We need to prepend the tag based on the key type (01 for Ed25519, 02 for Secp256k1)
      const publicKey = CLPublicKey.fromHex(account);
      const tag = publicKey.tag; // 1 or 2
      const tagHex = tag.toString(16).padStart(2, '0'); // "01" or "02"
      const signatureWithTag = tagHex + signatureHex;

      // Add the approval to the deploy
      const approval = new DeployUtil.Approval();
      approval.signer = account;
      approval.signature = signatureWithTag;
      deploy.approvals.push(approval);

      // Step 3: Submit signed deploy to the network
      const signedDeployJson = DeployUtil.deployToJson(deploy);
      const submitResult = await submitDeploy(JSON.stringify(signedDeployJson))
      console.log("Submit result:", submitResult);

      if (!submitResult.success) {
        throw new Error(submitResult.error || "Failed to submit deploy")
      }

      // Store deploy hash and start polling
      setDeployHash(submitResult.data?.deployHash || null)
      setDeployStatus("pending")
      setSaveSuccess(true)
      setRegisteredGuardians(validGuardians)
      
      // Save to localStorage for persistence across page refreshes
      if (typeof window !== 'undefined') {
        const storageKey = `guardians_${account}`
        localStorage.setItem(storageKey, JSON.stringify(validGuardians))
      }

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
          <a href="/" className="font-[var(--font-bebas)] text-2xl tracking-tight hover:text-accent transition-colors">
            SENTINELX
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
              Enter protector public keys (minimum 2). You will sign this transaction with your PRIMARY key (weight 3).
              Protectors will be stored on-chain.
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
                      Ready to setup protectors
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Protector Form */}
            {isConnected && !saveSuccess && (
              <div className="border border-border/30 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-8">
                  Protector Configuration
                </h3>

                <div className="space-y-6">
                  {/* Protector Inputs */}
                  {guardians.map((guardian, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                          Protector {index + 1} Public Key
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
                        placeholder="Enter protector public key..."
                        className={`w-full bg-transparent border px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors ${
                          guardianErrors[index] ? "border-red-500/50" : "border-border/30"
                        }`}
                      />
                      {guardianErrors[index] && (
                        <p className="font-mono text-xs text-red-500 mt-1">
                          {guardianErrors[index]}
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Add Protector Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleAddGuardian}
                      className="inline-flex items-center gap-3 border border-border/30 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200"
                    >
                      <span className="text-accent">+</span>
                      Add Protector
                    </button>
                    <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
                      All protectors must approve for recovery (threshold = {guardians.length})
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

                  <button
                    onClick={handleSaveGuardians}
                    disabled={guardians.some((g) => !g.trim()) || isSaving || guardianErrors.some((e) => e !== null)}
                    className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-foreground/20 disabled:hover:text-foreground"
                  >
                    <ScrambleTextOnHover
                      text={isSaving ? "Signing..." : "Save Protectors"}
                      as="span"
                      duration={0.6}
                    />
                    {!isSaving && (
                      <BitmapChevron className="transition-transform duration-400 ease-in-out group-hover:rotate-45" />
                    )}
                  </button>
                  <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
                    {isSaving
                      ? "Please sign the transaction in Casper Wallet..."
                      : "Casper Wallet will pop up for signature"}
                  </p>
                </div>
              </div>
            )}

            {/* Registered Protectors Display */}
            {isConnected && saveSuccess && registeredGuardians.length > 0 && (
              <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-mono text-xs uppercase tracking-widest text-accent">
                    Registered Protectors
                  </h3>
                  <span className="font-mono text-xs text-accent">
                    {registeredGuardians.length} Active
                  </span>
                </div>

                <div className="space-y-4">
                  {registeredGuardians.map((guardian, index) => (
                    <div key={index} className="border border-border/30 p-4 bg-background/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
                            Protector {index + 1}
                          </div>
                          <div className="font-mono text-xs text-foreground break-all">
                            {guardian}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                            Active
                          </span>
                          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Success Display */}
                {deployHash && (
                  <div className="mt-6 p-4 border border-accent/30 bg-background/50">
                    <p className="font-mono text-xs text-accent mb-2">
                      ✓ Registration Complete
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        Deploy Hash
                      </span>
                      <span className="font-mono text-[10px] text-foreground/60 break-all">
                        {deployHash}
                      </span>
                    </div>
                    {deployStatus === "pending" && (
                      <p className="mt-3 font-mono text-xs text-yellow-500">
                        ⏳ Waiting for blockchain confirmation...
                      </p>
                    )}
                    {deployStatus === "success" && (
                      <p className="mt-3 font-mono text-xs text-green-500">
                        ✓ Confirmed on blockchain
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-border/30">
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                    Your protectors are now registered on-chain. They can approve recovery requests from the dashboard.
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
            SentinelX v0.1
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

"use client"

import { useState, useEffect } from "react"
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
import { submitDeploy, getDeployStatus } from "@/lib/api"
import axios from "axios"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function AdminPage() {
  const [isConnected, setIsConnected] = useState(false)
  const [publicKey, setPublicKey] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  
  // Contract status
  const [contractStatus, setContractStatus] = useState<{deployed: boolean, contractHash: string | null} | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  
  // Deploy state
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployHash, setDeployHash] = useState<string | null>(null)
  const [deployStatus, setDeployStatus] = useState<"idle" | "pending" | "success" | "failed">("idle")

  // Check contract status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/recovery/contract-status`)
        if (res.data.success) {
          setContractStatus(res.data.data)
        }
      } catch (error) {
        console.error("Error checking contract status:", error)
      } finally {
        setIsLoadingStatus(false)
      }
    }
    checkStatus()
  }, [])

  // Check wallet connection
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const connected = await isWalletConnected()
        if (connected) {
          const key = await getActivePublicKey()
          if (key) {
            setIsConnected(true)
            setPublicKey(key)
          }
        }
      } catch (error) {
        console.error("Error checking wallet:", error)
      }
    }
    if (typeof window !== 'undefined') {
      setTimeout(checkConnection, 500)
    }
  }, [])

  // Poll deploy status
  useEffect(() => {
    if (!deployHash || deployStatus === "success" || deployStatus === "failed") return

    const poll = async () => {
      try {
        const result = await getDeployStatus(deployHash)
        if (result.success && result.data) {
          if (result.data.status === "success") {
            setDeployStatus("success")
          } else if (result.data.status === "failed") {
            setDeployStatus("failed")
            setDeployError("Deploy failed on-chain")
          }
        }
      } catch (error) {
        console.error("Error polling:", error)
      }
    }

    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [deployHash, deployStatus])

  const handleConnect = async () => {
    setIsConnecting(true)
    setConnectionError(null)
    try {
      if (!isCasperWalletInstalled()) {
        setConnectionError("Casper Wallet not installed")
        return
      }
      const key = await connectWallet()
      if (key) {
        setIsConnected(true)
        setPublicKey(key)
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to connect")
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectWallet()
      setIsConnected(false)
      setPublicKey("")
    } catch (error) {
      console.error("Disconnect error:", error)
    }
  }

  const handleDeployContract = async () => {
    setIsDeploying(true)
    setDeployError(null)
    setDeployStatus("pending")

    try {
      // Get unsigned deploy from backend
      const res = await axios.post(`${API_BASE}/api/recovery/deploy-contract`, {
        installerPublicKey: publicKey
      })

      if (!res.data.success || !res.data.data?.deployJson) {
        throw new Error(res.data.error || "Failed to build deploy")
      }

      // Sign with wallet
      const provider = getProvider()
      if (!provider) throw new Error("Wallet not available")

      const deployJson = res.data.data.deployJson
      const deployString = typeof deployJson === 'string' ? deployJson : JSON.stringify(deployJson)

      console.log("Requesting signature from wallet...")
      const response = await provider.sign(deployString, publicKey)
      if (response.cancelled) throw new Error("Cancelled by user")
      if (!response.signatureHex) throw new Error("No signature returned")

      console.log("Signature received:", response.signatureHex.substring(0, 20) + "...")

      // Parse the original deploy
      const originalJson = typeof deployJson === 'string' ? JSON.parse(deployJson) : deployJson
      const deployResult = DeployUtil.deployFromJson(originalJson)
      if (deployResult.err) {
        throw new Error(`Failed to parse deploy: ${deployResult.val}`)
      }
      const deploy = deployResult.unwrap()

      // Create proper signature with algorithm tag
      const pubKey = CLPublicKey.fromHex(publicKey)
      const tag = pubKey.isEd25519() ? '01' : '02'
      const fullSig = tag + response.signatureHex

      // Create and add approval
      const approval = new DeployUtil.Approval()
      approval.signer = pubKey.toHex()
      approval.signature = fullSig
      deploy.approvals.push(approval)

      console.log("Deploy hash:", Buffer.from(deploy.hash).toString('hex'))

      // Submit via backend
      const signedJson = DeployUtil.deployToJson(deploy)
      const submitResult = await submitDeploy(JSON.stringify(signedJson))

      if (!submitResult.success) {
        throw new Error(submitResult.error || "Failed to submit deploy")
      }

      console.log("Deploy submitted:", submitResult.data?.deployHash)
      setDeployHash(submitResult.data?.deployHash || null)

    } catch (error) {
      console.error("Deploy error:", error)
      setDeployError(error instanceof Error ? error.message : "Deploy failed")
      setDeployStatus("idle")
    } finally {
      setIsDeploying(false)
    }
  }

  return (
    <main className="relative min-h-screen">
      <AnimatedNoise opacity={0.03} />

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
          </div>
        </div>
      </nav>

      <section className="relative z-10 px-6 md:px-28 py-16 md:py-24">
        <div className="max-w-4xl">
          <div className="mb-16">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Admin</span>
            <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
              DEPLOY CONTRACT
            </h1>
            <p className="mt-6 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
              One-time setup: Deploy the recovery registry contract to the Casper network.
              This must be done before the app can be used.
            </p>
          </div>

          <div className="space-y-12">
            {/* Contract Status */}
            <div className="border border-border/30 p-6 md:p-8">
              <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-4">
                Contract Status
              </h3>
              {isLoadingStatus ? (
                <p className="font-mono text-sm text-muted-foreground">Loading...</p>
              ) : contractStatus?.deployed ? (
                <div className="space-y-2">
                  <p className="font-mono text-sm text-green-500">✓ Contract Deployed</p>
                  <p className="font-mono text-xs text-muted-foreground break-all">
                    Hash: {contractStatus.contractHash}
                  </p>
                </div>
              ) : (
                <p className="font-mono text-sm text-yellow-500">⚠ Contract not deployed</p>
              )}
            </div>

            {/* Wallet Connection */}
            <div className="border border-border/30 p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">
                    Deployer Wallet
                  </h3>
                  {isConnected ? (
                    <p className="font-mono text-sm text-accent">
                      Connected: {formatPublicKey(publicKey)}
                    </p>
                  ) : (
                    <p className="font-mono text-sm text-muted-foreground">
                      {isConnecting ? "Connecting..." : "Not connected"}
                    </p>
                  )}
                </div>
                {isConnected ? (
                  <button onClick={handleDisconnect} className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest hover:border-red-500 hover:text-red-500 transition-all">
                    Disconnect
                  </button>
                ) : (
                  <button onClick={handleConnect} disabled={isConnecting} className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest hover:border-accent hover:text-accent transition-all disabled:opacity-50">
                    Connect Wallet
                  </button>
                )}
              </div>
              {connectionError && (
                <p className="font-mono text-xs text-red-500">{connectionError}</p>
              )}
            </div>

            {/* Deploy Button */}
            {isConnected && !contractStatus?.deployed && (
              <div className="border border-border/30 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-4">
                  Deploy Contract
                </h3>
                
                {deployError && (
                  <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                    <p className="font-mono text-xs text-red-500">{deployError}</p>
                  </div>
                )}

                {deployHash && (
                  <div className={`mb-6 p-4 border ${deployStatus === "success" ? "border-green-500/30 bg-green-500/5" : "border-accent/30 bg-accent/5"}`}>
                    <p className={`font-mono text-xs ${deployStatus === "success" ? "text-green-500" : "text-accent"}`}>
                      {deployStatus === "success" ? "✓ Deploy Successful!" : "⏳ Waiting for confirmation..."}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground mt-2 break-all">
                      Deploy Hash: {deployHash}
                    </p>
                    {deployStatus === "success" && (
                      <div className="mt-4 p-3 bg-background/50 border border-border/30">
                        <p className="font-mono text-xs text-foreground mb-2">Next Steps:</p>
                        <ol className="font-mono text-[10px] text-muted-foreground space-y-1">
                          <li>1. Go to testnet.cspr.live and find your account</li>
                          <li>2. Look for "recovery_registry_hash" in Named Keys</li>
                          <li>3. Copy the hash (without "hash-" prefix)</li>
                          <li>4. Add to backend/.env: RECOVERY_CONTRACT_HASH=...</li>
                          <li>5. Restart the backend server</li>
                        </ol>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleDeployContract}
                  disabled={isDeploying || deployStatus === "success"}
                  className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest hover:border-accent hover:text-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ScrambleTextOnHover
                    text={isDeploying ? "Deploying..." : deployStatus === "success" ? "Deployed ✓" : "Deploy Contract"}
                    as="span"
                    duration={0.6}
                  />
                  {!isDeploying && deployStatus !== "success" && (
                    <BitmapChevron className="transition-transform duration-[400ms] group-hover:rotate-45" />
                  )}
                </button>
                <p className="mt-4 font-mono text-xs text-muted-foreground">
                  This costs ~300 CSPR for contract installation
                </p>
              </div>
            )}

            {/* Instructions */}
            <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
              <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                Setup Instructions
              </h3>
              <ol className="space-y-3">
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">1</span>
                  <span>Connect wallet with ~100 CSPR for deployment</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">2</span>
                  <span>Click "Deploy Contract" and sign the transaction</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">3</span>
                  <span>Wait for confirmation (~1-2 minutes)</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">4</span>
                  <span>Copy contract hash from your account's Named Keys</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">5</span>
                  <span>Add RECOVERY_CONTRACT_HASH to backend/.env</span>
                </li>
                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                  <span className="text-accent">6</span>
                  <span>Restart backend - app is ready!</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

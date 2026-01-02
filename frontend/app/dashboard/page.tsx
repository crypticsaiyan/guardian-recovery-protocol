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
import { approveRecovery, submitDeploy } from "@/lib/api"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export default function DashboardPage() {
    const sectionRef = useRef<HTMLElement>(null)
    const formRef = useRef<HTMLDivElement>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [guardianKey, setGuardianKey] = useState("")
    const [isConnecting, setIsConnecting] = useState(false)
    const [connectionError, setConnectionError] = useState<string | null>(null)

    // Recovery approval state
    const [recoveryId, setRecoveryId] = useState("")
    const [isApproving, setIsApproving] = useState(false)
    const [approveError, setApproveError] = useState<string | null>(null)
    const [approveSuccess, setApproveSuccess] = useState(false)
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

    const handleConnectWallet = async () => {
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

    const handleApproveRecovery = async () => {
        if (!recoveryId.trim()) {
            setApproveError("Please enter a Recovery ID")
            return
        }

        setIsApproving(true)
        setApproveError(null)
        setApproveSuccess(false)

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

            const unsignedDeploy = DeployUtil.deployFromJson(approveResult.data.deployJson).unwrap()
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

            setDeployHash(submitResult.data?.deployHash || null)
            setApproveSuccess(true)

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to approve recovery"
            setApproveError(errorMessage)
            console.error("Approval error:", error)
        } finally {
            setIsApproving(false)
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
                        <a href="/recovery" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
                            Recovery
                        </a>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <section className="relative z-10 px-6 md:px-28 py-16 md:py-24">
                <div className="max-w-4xl">
                    {/* Header */}
                    <div className="mb-16">
                        <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Guardian Dashboard</span>
                        <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
                            APPROVE RECOVERY
                        </h1>
                        <p className="mt-6 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
                            As a guardian, you can approve recovery requests here. Each approval adds to the threshold.
                            When enough guardians approve, the recovery can be finalized.
                        </p>
                    </div>

                    {/* Form */}
                    <div ref={formRef} className="space-y-12">
                        {/* Wallet Connection */}
                        <div className="border border-border/30 p-6 md:p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">
                                        Guardian Wallet
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
                                            onClick={handleConnectWallet}
                                            disabled={isConnecting}
                                            className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ScrambleTextOnHover text={isConnecting ? "Connecting..." : "Connect Wallet"} as="span" duration={0.6} />
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

                            {isConnected && (
                                <div className="pt-6 border-t border-border/30">
                                    <div className="grid grid-cols-1 gap-1 mb-2">
                                        <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                            Status
                                        </span>
                                        <span className="font-mono text-xs text-foreground/80">
                                            Ready to approve recovery requests
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Approve Recovery Form */}
                        {isConnected && (
                            <div className="border border-border/30 p-6 md:p-8">
                                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-8">
                                    Approve Recovery Request
                                </h3>

                                <div className="space-y-6">
                                    {/* Recovery ID Input */}
                                    <div className="space-y-2">
                                        <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                            Recovery ID / Deploy Hash
                                        </label>
                                        <input
                                            type="text"
                                            value={recoveryId}
                                            onChange={(e) => setRecoveryId(e.target.value)}
                                            placeholder="Enter the recovery ID or deploy hash..."
                                            className="w-full bg-transparent border border-border/30 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                                        />
                                        <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                                            Enter the recovery ID shared by the person who initiated recovery
                                        </p>
                                    </div>
                                </div>

                                {/* Approve Button */}
                                <div className="mt-8 pt-8 border-t border-border/30">
                                    {/* Error Display */}
                                    {approveError && (
                                        <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                                            <p className="font-mono text-xs text-red-500">
                                                {approveError}
                                            </p>
                                        </div>
                                    )}

                                    {/* Success Display */}
                                    {approveSuccess && deployHash && (
                                        <div className="mb-6 p-4 border border-green-500/30 bg-green-500/5">
                                            <p className="font-mono text-xs text-green-500 mb-2">
                                                ✓ Recovery approved successfully!
                                            </p>
                                            <p className="font-mono text-[10px] text-muted-foreground break-all">
                                                Deploy Hash: {deployHash}
                                            </p>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleApproveRecovery}
                                        disabled={!recoveryId.trim() || isApproving || approveSuccess}
                                        className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-foreground/20 disabled:hover:text-foreground"
                                    >
                                        <ScrambleTextOnHover
                                            text={isApproving ? "Signing..." : approveSuccess ? "Approved ✓" : "Approve Recovery"}
                                            as="span"
                                            duration={0.6}
                                        />
                                        {!isApproving && !approveSuccess && (
                                            <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                                        )}
                                    </button>
                                    <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
                                        {isApproving
                                            ? "Please sign the transaction in Casper Wallet..."
                                            : approveSuccess
                                                ? "Your approval has been submitted to the network"
                                                : "Casper Wallet will pop up for signature"}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Info Panel */}
                        <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
                            <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                                Guardian Responsibilities
                            </h3>
                            <ul className="space-y-3">
                                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                                    <span className="text-accent">01</span>
                                    <span>Verify the recovery request is from someone you know</span>
                                </li>
                                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                                    <span className="text-accent">02</span>
                                    <span>Contact the account owner through a trusted channel</span>
                                </li>
                                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                                    <span className="text-accent">03</span>
                                    <span>Confirm the new public key belongs to the rightful owner</span>
                                </li>
                                <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                                    <span className="text-accent">04</span>
                                    <span>Approve only after proper verification</span>
                                </li>
                            </ul>
                        </div>

                        {/* Security Notice */}
                        <div className="border border-border/30 p-6 md:p-8">
                            <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-4">
                                Security Notice
                            </h3>
                            <ul className="space-y-3">
                                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                                    <span className="text-accent">•</span>
                                    <span>Never approve a recovery request without verification</span>
                                </li>
                                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                                    <span className="text-accent">•</span>
                                    <span>Attackers may try to impersonate the account owner</span>
                                </li>
                                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                                    <span className="text-accent">•</span>
                                    <span>Your approval is binding and cannot be revoked</span>
                                </li>
                                <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                                    <span className="text-accent">•</span>
                                    <span>Each guardian approval adds weight toward the threshold</span>
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
                        <a href="/setup" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
                            Setup
                        </a>
                    </div>
                </div>
            </div>
        </main>
    )
}

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
import { approveRecovery, submitDeploy, getDeployStatus } from "@/lib/api"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

type ViewMode = "user" | "guardian"
type RecoveryPhase = "initiated" | "approvals" | "waiting" | "finalized"

interface GuardianStatus {
    publicKey: string
    approved: boolean
    approvedAt?: string
}

interface RecoveryProgress {
    recoveryId: string
    currentPhase: RecoveryPhase
    targetAccount: string
    newPublicKey: string
    initiatedAt: string
    guardians: GuardianStatus[]
    waitingPeriodEnds?: string
}

const phases: { id: RecoveryPhase; label: string; description: string }[] = [
    { id: "initiated", label: "Initiated", description: "Recovery request submitted" },
    { id: "approvals", label: "Approvals", description: "Guardians reviewing request" },
    { id: "waiting", label: "Waiting Period", description: "30-day security delay" },
    { id: "finalized", label: "Complete", description: "Account recovered" },
]

function PhaseCheckpoint({ 
    phase, 
    isActive, 
    isComplete, 
    isLast 
}: { 
    phase: typeof phases[0]
    isActive: boolean
    isComplete: boolean
    isLast: boolean
}) {
    return (
        <div className="flex items-start gap-4 relative">
            {/* Vertical connector line */}
            {!isLast && (
                <div 
                    className={`absolute left-[15px] top-[32px] w-[2px] h-[calc(100%+16px)] ${
                        isComplete ? "bg-green-500" : "bg-border/30"
                    }`}
                />
            )}
            
            {/* Checkpoint box */}
            <div 
                className={`relative z-10 w-8 h-8 flex items-center justify-center border-2 transition-all duration-300 ${
                    isComplete 
                        ? "bg-green-500/20 border-green-500 text-green-500" 
                        : isActive 
                            ? "bg-accent/20 border-accent text-accent animate-pulse" 
                            : "bg-background border-border/50 text-muted-foreground"
                }`}
            >
                {isComplete ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : (
                    <span className="font-mono text-xs">{phases.findIndex(p => p.id === phase.id) + 1}</span>
                )}
            </div>
            
            {/* Phase info */}
            <div className="flex-1 pb-8">
                <h4 className={`font-mono text-sm uppercase tracking-widest ${
                    isComplete ? "text-green-500" : isActive ? "text-accent" : "text-muted-foreground"
                }`}>
                    {phase.label}
                </h4>
                <p className="font-mono text-xs text-muted-foreground mt-1">
                    {phase.description}
                </p>
            </div>
        </div>
    )
}

function GuardianApprovalCard({ guardian, index }: { guardian: GuardianStatus; index: number }) {
    return (
        <div className={`border p-4 transition-all duration-300 ${
            guardian.approved 
                ? "border-green-500/50 bg-green-500/5" 
                : "border-border/30 bg-background"
        }`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 flex items-center justify-center border ${
                        guardian.approved 
                            ? "border-green-500 text-green-500 bg-green-500/10" 
                            : "border-border/50 text-muted-foreground"
                    }`}>
                        {guardian.approved ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        ) : (
                            <span className="font-mono text-xs">{index + 1}</span>
                        )}
                    </div>
                    <div>
                        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                            Guardian {index + 1}
                        </p>
                        <p className="font-mono text-xs text-foreground/80 mt-1">
                            {formatPublicKey(guardian.publicKey, 10, 8)}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <span className={`font-mono text-xs uppercase tracking-widest ${
                        guardian.approved ? "text-green-500" : "text-yellow-500"
                    }`}>
                        {guardian.approved ? "Approved" : "Pending"}
                    </span>
                    {guardian.approvedAt && (
                        <p className="font-mono text-[10px] text-muted-foreground mt-1">
                            {new Date(guardian.approvedAt).toLocaleDateString()}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function DashboardPage() {
    const sectionRef = useRef<HTMLElement>(null)
    const formRef = useRef<HTMLDivElement>(null)
    const [viewMode, setViewMode] = useState<ViewMode>("user")
    const [isConnected, setIsConnected] = useState(false)
    const [publicKey, setPublicKey] = useState("")
    const [isConnecting, setIsConnecting] = useState(false)
    const [connectionError, setConnectionError] = useState<string | null>(null)

    // Guardian approval state
    const [recoveryId, setRecoveryId] = useState("")
    const [isApproving, setIsApproving] = useState(false)
    const [approveError, setApproveError] = useState<string | null>(null)
    const [approveSuccess, setApproveSuccess] = useState(false)
    const [deployHash, setDeployHash] = useState<string | null>(null)

    // User recovery progress state
    const [userRecoveryId, setUserRecoveryId] = useState("")
    const [recoveryProgress, setRecoveryProgress] = useState<RecoveryProgress | null>(null)
    const [isLoadingProgress, setIsLoadingProgress] = useState(false)
    const [progressError, setProgressError] = useState<string | null>(null)

    useEffect(() => {
        const checkExistingConnection = async () => {
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

    // Poll for recovery progress
    useEffect(() => {
        if (viewMode !== "user" || !userRecoveryId || !recoveryProgress) return

        const pollProgress = async () => {
            try {
                const result = await getDeployStatus(userRecoveryId)
                if (result.success && result.data) {
                    // Update progress based on deploy status
                    setRecoveryProgress(prev => {
                        if (!prev) return null
                        const approvedCount = prev.guardians.filter(g => g.approved).length
                        let newPhase: RecoveryPhase = prev.currentPhase
                        
                        if (result.data?.status === "success" && approvedCount >= prev.guardians.length) {
                            newPhase = "waiting"
                        }
                        
                        return { ...prev, currentPhase: newPhase }
                    })
                }
            } catch (error) {
                console.error("Error polling recovery progress:", error)
            }
        }

        const interval = setInterval(pollProgress, 10000)
        return () => clearInterval(interval)
    }, [viewMode, userRecoveryId, recoveryProgress])

    const handleConnectWallet = async () => {
        setIsConnecting(true)
        setConnectionError(null)

        try {
            if (!isCasperWalletInstalled()) {
                setConnectionError("Casper Wallet extension is not installed. Please install it from casperwallet.io")
                window.open("https://www.casperwallet.io/", "_blank")
                return
            }

            const key = await connectWallet()
            if (key) {
                setIsConnected(true)
                setPublicKey(key)
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
                setPublicKey("")
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
            const approveResult = await approveRecovery(publicKey, recoveryId.trim())

            if (!approveResult.success || !approveResult.data?.deployJson) {
                throw new Error(approveResult.error || "Failed to build approval deploy")
            }

            const provider = getProvider()
            if (!provider) {
                throw new Error("Casper Wallet not available")
            }

            // Sign the deploy with Casper Wallet
            const deployJson = approveResult.data.deployJson
            const deployString = typeof deployJson === 'string' ? deployJson : JSON.stringify(deployJson)

            const response = await provider.sign(deployString, publicKey)

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
            const { CLPublicKey } = await import("casper-js-sdk")
            const pubKey = CLPublicKey.fromHex(publicKey)

            // Casper Wallet returns the signature without the algorithm tag
            // We need to prepend the tag: 01 for Ed25519, 02 for Secp256k1
            const algorithmTag = pubKey.isEd25519() ? '01' : '02'
            const fullSignature = algorithmTag + signatureHex

            // Create a proper approval with hex strings
            const approval = new DeployUtil.Approval()
            approval.signer = pubKey.toHex()
            approval.signature = fullSignature

            // Add the approval to the deploy
            deploy.approvals.push(approval)

            // Submit signed deploy to the network
            const signedDeployJson = DeployUtil.deployToJson(deploy)
            const submitResult = await submitDeploy(JSON.stringify(signedDeployJson))

            if (!submitResult.success) {
                throw new Error(submitResult.error || "Failed to submit deploy")
            }

            setDeployHash(submitResult.data?.deployHash || null)
            setApproveSuccess(true)

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to approve recovery"
            setApproveError(errorMessage)
        } finally {
            setIsApproving(false)
        }
    }

    const handleTrackRecovery = async () => {
        if (!userRecoveryId.trim()) {
            setProgressError("Please enter a Recovery ID")
            return
        }

        setIsLoadingProgress(true)
        setProgressError(null)

        try {
            const result = await getDeployStatus(userRecoveryId.trim())
            
            // Mock guardian data - in production this would come from the backend
            const mockGuardians: GuardianStatus[] = [
                { 
                    publicKey: "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef01", 
                    approved: result.success && result.data?.status === "success",
                    approvedAt: result.success ? new Date().toISOString() : undefined
                },
                { 
                    publicKey: "02b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef0102", 
                    approved: false 
                },
                { 
                    publicKey: "03c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef010203", 
                    approved: false 
                },
            ]

            const approvedCount = mockGuardians.filter(g => g.approved).length
            let currentPhase: RecoveryPhase = "initiated"
            
            if (result.success && result.data?.status === "success") {
                currentPhase = approvedCount >= mockGuardians.length ? "waiting" : "approvals"
            } else if (result.success) {
                currentPhase = "approvals"
            }

            setRecoveryProgress({
                recoveryId: userRecoveryId.trim(),
                currentPhase,
                targetAccount: "Pending verification",
                newPublicKey: "Pending verification",
                initiatedAt: new Date().toISOString(),
                guardians: mockGuardians,
            })
        } catch (error) {
            setProgressError("Failed to fetch recovery status. Please verify the Recovery ID.")
        } finally {
            setIsLoadingProgress(false)
        }
    }

    const getPhaseIndex = (phase: RecoveryPhase) => phases.findIndex(p => p.id === phase)
    const approvedCount = recoveryProgress?.guardians.filter(g => g.approved).length ?? 0
    const totalGuardians = recoveryProgress?.guardians.length ?? 0

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
                        <a href="/setup" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
                            Setup
                        </a>
                        <a href="/recovery" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
                            Recovery
                        </a>
                        <a href="/approve" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
                            Approve
                        </a>
                        <a href="/execute" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
                            Execute
                        </a>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <section className="relative z-10 px-6 md:px-28 py-16 md:py-24">
                <div className="max-w-4xl">
                    {/* Header */}
                    <div className="mb-12">
                        <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Dashboard</span>
                        <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
                            {viewMode === "user" ? "RECOVERY STATUS" : "APPROVALS"}
                        </h1>
                        <p className="mt-6 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
                            {viewMode === "user" 
                                ? "Track the progress of your account recovery. Monitor guardian approvals and recovery status."
                                : "As a protector, you can approve recovery requests here. Each approval adds to the threshold."}
                        </p>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="mb-12 border border-border/30 p-4 inline-flex gap-2">
                        <button
                            onClick={() => setViewMode("user")}
                            className={`px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all duration-200 ${
                                viewMode === "user" 
                                    ? "bg-accent text-background" 
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            I'm Recovering
                        </button>
                        <button
                            onClick={() => setViewMode("guardian")}
                            className={`px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all duration-200 ${
                                viewMode === "guardian" 
                                    ? "bg-accent text-background" 
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            I'm a Guardian
                        </button>
                    </div>

                    {/* Form */}
                    <div ref={formRef} className="space-y-12">
                        {/* Wallet Connection */}
                        <div className="border border-border/30 p-6 md:p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">
                                        {viewMode === "user" ? "Your Wallet" : "Protector Wallet"}
                                    </h3>
                                    {isConnected ? (
                                        <div>
                                            <p className="font-mono text-sm text-accent">
                                                Connected: {formatPublicKey(publicKey)}
                                            </p>
                                            <p className="font-mono text-[10px] text-muted-foreground mt-1 break-all max-w-md">
                                                {publicKey}
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
                            {connectionError && (
                                <div className="p-4 border border-red-500/30 bg-red-500/5">
                                    <p className="font-mono text-xs text-red-500">{connectionError}</p>
                                </div>
                            )}
                        </div>

                        {/* USER VIEW */}
                        {viewMode === "user" && (
                            <>
                                {/* Track Recovery Form */}
                                <div className="border border-border/30 p-6 md:p-8">
                                    <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-8">
                                        Track Your Recovery
                                    </h3>
                                    <div className="space-y-2">
                                        <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                            Recovery ID / Deploy Hash
                                        </label>
                                        <input
                                            type="text"
                                            value={userRecoveryId}
                                            onChange={(e) => setUserRecoveryId(e.target.value)}
                                            placeholder="Enter your recovery ID..."
                                            className="w-full bg-transparent border border-border/30 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                                        />
                                        <p className="font-mono text-xs text-muted-foreground">
                                            The deploy hash you received when initiating recovery
                                        </p>
                                    </div>

                                    <div className="mt-8 pt-8 border-t border-border/30">
                                        {progressError && (
                                            <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                                                <p className="font-mono text-xs text-red-500">{progressError}</p>
                                            </div>
                                        )}
                                        <button
                                            onClick={handleTrackRecovery}
                                            disabled={!userRecoveryId.trim() || isLoadingProgress}
                                            className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ScrambleTextOnHover
                                                text={isLoadingProgress ? "Loading..." : "Track Recovery"}
                                                as="span"
                                                duration={0.6}
                                            />
                                            {!isLoadingProgress && (
                                                <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Recovery Progress Display */}
                                {recoveryProgress && (
                                    <>
                                        {/* Phase Progress - Checkpoint Style */}
                                        <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
                                            <div className="flex items-center justify-between mb-8">
                                                <h3 className="font-mono text-xs uppercase tracking-widest text-accent">
                                                    Recovery Progress
                                                </h3>
                                                <span className="font-mono text-xs text-foreground/60">
                                                    Phase {getPhaseIndex(recoveryProgress.currentPhase) + 1} of {phases.length}
                                                </span>
                                            </div>

                                            {/* Checkpoint Timeline */}
                                            <div className="pl-2">
                                                {phases.map((phase, index) => (
                                                    <PhaseCheckpoint
                                                        key={phase.id}
                                                        phase={phase}
                                                        isActive={phase.id === recoveryProgress.currentPhase}
                                                        isComplete={getPhaseIndex(phase.id) < getPhaseIndex(recoveryProgress.currentPhase) || 
                                                            (phase.id === "finalized" && recoveryProgress.currentPhase === "finalized")}
                                                        isLast={index === phases.length - 1}
                                                    />
                                                ))}
                                            </div>

                                            {/* Recovery Details */}
                                            <div className="mt-6 pt-6 border-t border-accent/30 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                        Recovery ID
                                                    </span>
                                                    <p className="font-mono text-xs text-foreground/80 mt-1 break-all">
                                                        {recoveryProgress.recoveryId}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                        Initiated
                                                    </span>
                                                    <p className="font-mono text-xs text-foreground/80 mt-1">
                                                        {new Date(recoveryProgress.initiatedAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Guardian Approvals Section */}
                                        <div className="border border-border/30 p-6 md:p-8">
                                            <div className="flex items-center justify-between mb-6">
                                                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground">
                                                    Guardian Approvals
                                                </h3>
                                                <span className={`font-mono text-xs uppercase tracking-widest ${
                                                    approvedCount === totalGuardians ? "text-green-500" : "text-accent"
                                                }`}>
                                                    {approvedCount} / {totalGuardians} Approved
                                                </span>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="mb-6">
                                                <div className="h-2 bg-border/30 overflow-hidden">
                                                    <div 
                                                        className={`h-full transition-all duration-500 ${
                                                            approvedCount === totalGuardians ? "bg-green-500" : "bg-accent"
                                                        }`}
                                                        style={{ width: `${(approvedCount / totalGuardians) * 100}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Guardian Cards */}
                                            <div className="space-y-3">
                                                {recoveryProgress.guardians.map((guardian, index) => (
                                                    <GuardianApprovalCard 
                                                        key={guardian.publicKey} 
                                                        guardian={guardian} 
                                                        index={index} 
                                                    />
                                                ))}
                                            </div>

                                            {/* Share Recovery ID Prompt */}
                                            {approvedCount < totalGuardians && (
                                                <div className="mt-6 p-4 border border-yellow-500/30 bg-yellow-500/5">
                                                    <p className="font-mono text-xs text-yellow-500">
                                                        ⚠ Share your Recovery ID with pending guardians so they can approve your request.
                                                    </p>
                                                    <div className="mt-3 flex items-center gap-2">
                                                        <code className="flex-1 font-mono text-[10px] text-foreground/80 bg-background/50 px-3 py-2 break-all">
                                                            {recoveryProgress.recoveryId}
                                                        </code>
                                                        <button
                                                            onClick={() => navigator.clipboard.writeText(recoveryProgress.recoveryId)}
                                                            className="px-3 py-2 border border-border/30 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                                                        >
                                                            Copy
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Waiting Period Info (if applicable) */}
                                        {recoveryProgress.currentPhase === "waiting" && (
                                            <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
                                                <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                                                    Waiting Period Active
                                                </h3>
                                                <p className="font-mono text-sm text-foreground/80 mb-4">
                                                    All guardians have approved. The 30-day security waiting period is now active.
                                                </p>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                            Started
                                                        </span>
                                                        <p className="font-mono text-xs text-foreground/80 mt-1">
                                                            {new Date().toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                            Ends
                                                        </span>
                                                        <p className="font-mono text-xs text-foreground/80 mt-1">
                                                            {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Info Panel */}
                                <div className="border border-border/30 p-6 md:p-8">
                                    <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-4">
                                        What to Expect
                                    </h3>
                                    <ul className="space-y-3">
                                        <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                                            <span className="text-accent">•</span>
                                            <span>Share your Recovery ID with your guardians so they can approve</span>
                                        </li>
                                        <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                                            <span className="text-accent">•</span>
                                            <span>All guardians must approve for recovery to proceed</span>
                                        </li>
                                        <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                                            <span className="text-accent">•</span>
                                            <span>After threshold is met, a 30-day waiting period begins</span>
                                        </li>
                                        <li className="font-mono text-sm text-muted-foreground flex items-start gap-3">
                                            <span className="text-accent">•</span>
                                            <span>Recovery will be finalized automatically after the waiting period</span>
                                        </li>
                                    </ul>
                                </div>
                            </>
                        )}

                        {/* GUARDIAN VIEW */}
                        {viewMode === "guardian" && isConnected && (
                            <>
                                <div className="border border-border/30 p-6 md:p-8">
                                    <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-8">
                                        Approve Recovery Request
                                    </h3>
                                    <div className="space-y-2">
                                        <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                            Recovery ID / Deploy Hash
                                        </label>
                                        <input
                                            type="text"
                                            value={recoveryId}
                                            onChange={(e) => setRecoveryId(e.target.value)}
                                            placeholder="Enter the recovery ID..."
                                            className="w-full bg-transparent border border-border/30 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                                        />
                                        <p className="font-mono text-xs text-muted-foreground">
                                            Enter the recovery ID shared by the person who initiated recovery
                                        </p>
                                    </div>

                                    <div className="mt-8 pt-8 border-t border-border/30">
                                        {approveError && (
                                            <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                                                <p className="font-mono text-xs text-red-500">{approveError}</p>
                                            </div>
                                        )}
                                        {approveSuccess && deployHash && (
                                            <div className="mb-6 p-4 border border-green-500/30 bg-green-500/5">
                                                <p className="font-mono text-xs text-green-500 mb-2">✓ Recovery approved successfully!</p>
                                                <p className="font-mono text-[10px] text-muted-foreground break-all">
                                                    Deploy Hash: {deployHash}
                                                </p>
                                            </div>
                                        )}
                                        <button
                                            onClick={handleApproveRecovery}
                                            disabled={!recoveryId.trim() || isApproving || approveSuccess}
                                            className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                        <p className="mt-4 font-mono text-xs text-muted-foreground">
                                            {isApproving ? "Please sign the transaction in Casper Wallet..." 
                                                : approveSuccess ? "Your approval has been submitted" 
                                                : "Casper Wallet will pop up for signature"}
                                        </p>
                                    </div>
                                </div>

                                {/* Guardian Responsibilities */}
                                <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
                                    <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                                        Protector Responsibilities
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
                                            <span>Each protector approval adds weight toward the threshold</span>
                                        </li>
                                    </ul>
                                </div>
                            </>
                        )}
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

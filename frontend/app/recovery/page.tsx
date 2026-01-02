"use client"

import { useState, useRef, useEffect } from "react"
import { AnimatedNoise } from "@/components/animated-noise"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { BitmapChevron } from "@/components/bitmap-chevron"
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
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "pending" | "submitted">("idle")

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
    // TODO: Implement Casper Wallet connection with guardian key
    setIsConnected(true)
    setGuardianKey("guardian1@hash...")
  }

  const handleStartRecovery = async () => {
    // TODO: Implement smart contract call for start_recovery
    setRecoveryStatus("submitted")
    console.log("Starting recovery for:", accountAddress, "New key:", newPublicKey)
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
            <a href="/#how-it-works" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="/setup" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Setup
            </a>
            <a href="/dashboard" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
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
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Phase 2 / Recovery</span>
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
                    <p className="font-mono text-sm text-accent">
                      Connected: {guardianKey}
                    </p>
                  ) : (
                    <p className="font-mono text-sm text-muted-foreground">
                      Not connected
                    </p>
                  )}
                </div>
                {!isConnected && (
                  <button
                    onClick={handleConnectGuardianKey}
                    className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200"
                  >
                    <ScrambleTextOnHover text="Connect Guardian Key" as="span" duration={0.6} />
                    <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                  </button>
                )}
              </div>

              {!isConnected && (
                <div className="pt-6 border-t border-border/30">
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    ⚠ You need to import a guardian key from one of your friends into Casper Wallet before starting recovery.
                  </p>
                </div>
              )}

              {isConnected && (
                <div className="pt-6 border-t border-border/30">
                  <div className="grid grid-cols-1 gap-1 mb-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
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
                    <label className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                      Your Account Address
                    </label>
                    <input
                      type="text"
                      value={accountAddress}
                      onChange={(e) => setAccountAddress(e.target.value)}
                      placeholder="Enter your account address..."
                      className="w-full bg-transparent border border-border/30 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                    />
                    <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                      The account you lost access to
                    </p>
                  </div>

                  {/* New Public Key */}
                  <div className="space-y-2">
                    <label className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                      New Recovery Key
                    </label>
                    <input
                      type="text"
                      value={newPublicKey}
                      onChange={(e) => setNewPublicKey(e.target.value)}
                      placeholder="Enter your new public key..."
                      className="w-full bg-transparent border border-border/30 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                    />
                    <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                      The new key that will replace your lost primary key
                    </p>
                  </div>
                </div>

                {/* Start Recovery Button */}
                <div className="mt-8 pt-8 border-t border-border/30">
                  <button
                    onClick={handleStartRecovery}
                    disabled={!accountAddress.trim() || !newPublicKey.trim()}
                    className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-foreground/20 disabled:hover:text-foreground"
                  >
                    <ScrambleTextOnHover text="Start Recovery" as="span" duration={0.6} />
                    <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                  </button>
                  <p className="mt-4 font-mono text-[10px] text-muted-foreground leading-relaxed">
                    Casper Wallet will pop up for signature
                  </p>
                </div>
              </div>
            )}

            {/* Recovery Submitted Status */}
            {recoveryStatus === "submitted" && (
              <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                  Recovery Initiated ✓
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-1">
                    <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                      Account
                    </span>
                    <span className="font-mono text-xs text-foreground/80 break-all">
                      {accountAddress}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                      New Key
                    </span>
                    <span className="font-mono text-xs text-foreground/80 break-all">
                      {newPublicKey}
                    </span>
                  </div>
                  <div className="pt-4 border-t border-accent/30">
                    <p className="font-mono text-sm text-foreground/80">
                      Your guardians have been notified. Waiting for 3 approvals...
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
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Guardian Recovery Protocol v0.1
          </div>
          <div className="flex items-center gap-6">
            <a href="/#how-it-works" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
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

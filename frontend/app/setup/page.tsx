"use client"

import { useState, useRef, useEffect } from "react"
import { AnimatedNoise } from "@/components/animated-noise"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { BitmapChevron } from "@/components/bitmap-chevron"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export default function SetupPage() {
  const sectionRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [guardians, setGuardians] = useState(["", ""])
  const [isConnected, setIsConnected] = useState(false)
  const [account, setAccount] = useState("")
  const minGuardians = 2

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
    // TODO: Implement Casper Wallet connection
    setIsConnected(true)
    setAccount("alice@hash123...")
  }

  const handleSaveGuardians = async () => {
    // Threshold automatically equals number of guardians (all must approve)
    const threshold = guardians.length
    // TODO: Implement smart contract call
    console.log("Saving guardians:", guardians, "Threshold:", threshold)
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
            <a href="/recovery" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
              Recovery
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
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">Phase 1 / Setup</span>
            <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
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
                    <p className="font-mono text-sm text-accent">
                      Connected: {account}
                    </p>
                  ) : (
                    <p className="font-mono text-sm text-muted-foreground">
                      Not connected
                    </p>
                  )}
                </div>
                {!isConnected && (
                  <button
                    onClick={handleConnectWallet}
                    className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200"
                  >
                    <ScrambleTextOnHover text="Connect Wallet" as="span" duration={0.6} />
                    <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                  </button>
                )}
              </div>

              {isConnected && (
                <div className="pt-6 border-t border-border/30">
                  <div className="grid grid-cols-1 gap-1 mb-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
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
                        <label className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                          Guardian {index + 1} Public Key
                        </label>
                        {guardians.length > minGuardians && (
                          <button
                            onClick={() => handleRemoveGuardian(index)}
                            className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
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
                      className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors"
                    >
                      <span className="text-accent">+</span>
                      Add Guardian
                    </button>
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground leading-relaxed">
                      All guardians must approve for recovery (threshold = {guardians.length})
                    </p>
                  </div>
                </div>

                {/* Save Button */}
                <div className="mt-8 pt-8 border-t border-border/30">
                  <button
                    onClick={handleSaveGuardians}
                    disabled={guardians.some((g) => !g.trim())}
                    className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-foreground/20 disabled:hover:text-foreground"
                  >
                    <ScrambleTextOnHover text="Save Guardians" as="span" duration={0.6} />
                    <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
                  </button>
                  <p className="mt-4 font-mono text-[10px] text-muted-foreground leading-relaxed">
                    Casper Wallet will pop up for signature
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
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Guardian Recovery Protocol v0.1
          </div>
          <div className="flex items-center gap-6">
            <a href="/#how-it-works" className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
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

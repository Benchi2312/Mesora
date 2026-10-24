import Navbar from './Navbar'
import Hero from './Hero'
import Features from './Features'
import Flujo from './Flujo'
import DashboardSection from './DashboardSection'
import ControlSection from './ControlSection'
import Planes from './Planes'
import Footer from './Footer'

export default function Landing() {
  return (
    <div className="min-h-screen bg-surface-950 text-zinc-100">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Flujo />
        <DashboardSection />
        <ControlSection />
        <Planes />
      </main>
      <Footer />
    </div>
  )
}
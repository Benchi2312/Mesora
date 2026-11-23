import Navbar from './Navbar'
import Hero from './Hero'
import Features from './Features'
import Roles from './Roles'
import Flujo from './Flujo'
import Beneficios from './Beneficios'
import Seguridad from './Seguridad'
import DashboardSection from './DashboardSection'
import ControlSection from './ControlSection'
import Planes from './Planes'
import PreguntasFrecuentes from './PreguntasFrecuentes'
import Contacto from './Contacto'
import FinalCTA from './FinalCTA'
import Footer from './Footer'

export default function Landing() {
  return (
    <div className="min-h-screen bg-surface-950 text-zinc-100">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Roles />
        <Flujo />
        <Beneficios />
        <DashboardSection />
        <ControlSection />
        <Seguridad />
        <Planes />
        <PreguntasFrecuentes />
        <Contacto />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}

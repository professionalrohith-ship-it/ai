import { Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '../../components/common/EmptyState'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { ROUTES } from '../../constants/navigation'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="animate-fade-up py-8">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you are looking for does not exist or has moved. Use the sidebar or head back to the dashboard."
        action={<PrimaryButton onClick={() => navigate(ROUTES.dashboard)}>Back to dashboard</PrimaryButton>}
      />
    </div>
  )
}

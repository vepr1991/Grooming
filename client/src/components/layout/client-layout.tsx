import { Outlet } from "react-router-dom";

export function ClientLayout() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-md mx-auto bg-white min-h-screen shadow-xl">
        {/* У клиента просто контент, без нижнего меню */}
        <Outlet />
      </div>
    </div>
  );
}
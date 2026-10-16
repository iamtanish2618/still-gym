import type { GymModel } from "../hooks/use-gym";
import { CheckIn } from "./CheckIn";
import { CreateSession } from "./CreateSession";
import { SessionRegister } from "./SessionRegister";
type Props = GymModel;
export function AdminView(model: Props) {
  return (
    <>
      <div className="admin-grid">
        <CreateSession {...model} />
        <CheckIn {...model} />
      </div>
      <SessionRegister {...model} />
    </>
  );
}

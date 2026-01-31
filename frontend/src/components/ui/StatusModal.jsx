import PropTypes from "prop-types";
import { DOCUMENT_STATUSES } from "../../utils/constants";
import Button from "./Button";

const StatusModal = ({ open, title, status, onChange, onCancel, onSave }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>

        {/* 🔽 Status dropdown */}
        <select
          value={status}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          {Object.values(DOCUMENT_STATUSES).map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        {/* Actions */}
      <div className="flex justify-end gap-3">
  <Button variant="ghost" onClick={onCancel}>
    Cancel
  </Button>

  <Button variant="danger" onClick={onSave}>
    Done
  </Button>
</div>

      </div>
    </div>
  );
};

StatusModal.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

export default StatusModal;

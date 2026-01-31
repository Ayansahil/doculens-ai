import PropTypes from "prop-types";
import Button from "./Button";
import Card from "./Card";

const ConfirmModal = ({
  open,
  title = "Are you sure?",
  message,
  children, // ✅ used for dropdown / custom content
  confirmText = "Delete",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  confirmVariant = "danger", // ✅ NEW (danger | primary)
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-full max-w-sm p-6 space-y-4">
        {/*  Title */}
        <h2 className="text-lg font-semibold">{title}</h2>

        {/*  Optional message (used in delete) */}
        {message && (
          <p className="text-sm text-gray-600">{message}</p>
        )}

        {/*  Custom content (used in edit status dropdown) */}
        {children && <div className="pt-2">{children}</div>}

        {/*  Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>

          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </Card>
    </div>
  );
};

ConfirmModal.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string,
  message: PropTypes.string, // ❗ now optional
  children: PropTypes.node,
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  confirmVariant: PropTypes.string,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default ConfirmModal;

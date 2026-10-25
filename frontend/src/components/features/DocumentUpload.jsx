import { useState, useRef } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PropTypes from 'prop-types';
import { api } from '../../services/api';
import { formatFileSize, validateFile } from '../../utils/helpers';
import { useApp } from '../../context/AppContext';

const DocumentUpload = ({ onUploadComplete }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const { addNotification } = useApp();

  const handleSelect = (e) => {
    const selected = Array.from(e.target.files);
    const valid = [];

    selected.forEach(file => {
      const check = validateFile(file);
      if (check.isValid) {
        valid.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          size: file.size,
          progress: 0,
          status: 'pending'
        });
      } else {
        addNotification({ type: 'error', message: check.error });
      }
    });

    if (valid.length > 0) {
      setFiles(prev => [...prev, ...valid]);
      setTimeout(() => uploadFiles([...files, ...valid]), 0);
    }
  };

  const uploadFiles = async (filesArg) => {
    const filesToProcess = Array.isArray(filesArg) ? filesArg : files;
    setUploading(true);

    for (const f of filesToProcess) {
      if (f.status === 'uploaded') continue;

      try {
        const formData = new FormData();
        formData.append('file', f.file);

        await api.uploadDocument(formData);

        f.status = 'uploaded';
        f.progress = 100;
        addNotification({ type: 'success', message: `${f.name} uploaded` });
      } catch {
        f.status = 'error';
        addNotification({ type: 'error', message: `Upload failed: ${f.name}` });
      }
    }

    setUploading(false);
    setFiles([]);
    onUploadComplete?.();
  };

  return (
    <Card className="p-6">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={handleSelect}
      />

      <div className="border-dashed border-2 p-4 text-center sm:p-6">
        <Upload className="mx-auto mb-2 " />
        <Button variant="outline" className="min-h-11" onClick={() => inputRef.current.click()}>
          Choose Files
        </Button>
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map(f => (
            <div key={f.id} className="flex min-w-0 items-start justify-between gap-3 border p-2 rounded">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm [overflow-wrap:anywhere]">{f.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(f.size)}</p>
              </div>
              {f.status === 'uploaded'
                ? <CheckCircle className="shrink-0 text-green-500" />
                : f.status === 'error'
                ? <AlertCircle className="shrink-0 text-red-500" />
                : <File className="shrink-0" />}
            </div>
          ))}

          <Button onClick={uploadFiles} loading={uploading}>
            Upload
          </Button>
        </div>
      )}
    </Card>
  );
};



DocumentUpload.propTypes = {
  onUploadComplete: PropTypes.func
};

export default DocumentUpload;

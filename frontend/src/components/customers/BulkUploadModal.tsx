import { useState, useRef } from 'react'
import { X, Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { customersService, BulkUploadResult } from '@/services/customers'

interface BulkUploadModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function BulkUploadModal({ onClose, onSuccess }: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [result, setResult] = useState<BulkUploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
        setError('Please select a CSV file')
        return
      }
      setFile(selectedFile)
      setError(null)
      setResult(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      if (!droppedFile.name.toLowerCase().endsWith('.csv')) {
        setError('Please select a CSV file')
        return
      }
      setFile(droppedFile)
      setError(null)
      setResult(null)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      await customersService.downloadBulkTemplate()
    } catch (err: any) {
      setError(err.message || 'Failed to download template')
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setError(null)

    try {
      const uploadResult = await customersService.bulkUpload(file)
      setResult(uploadResult)
      
      if (uploadResult.successful > 0) {
        onSuccess()
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (!isUploading) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Bulk Upload Customers</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Instructions */}
          <div className="rounded-lg bg-blue-50 p-4">
            <h3 className="font-medium text-blue-800">Instructions</h3>
            <ul className="mt-2 space-y-1 text-sm text-blue-700">
              <li>• Download the template CSV file below</li>
              <li>• Fill in customer data (one customer per row)</li>
              <li>• Required fields: first_name, last_name, phone_primary</li>
              <li>• For individuals: id_number and driver_license_number are required</li>
              <li>• For companies: company_name is required</li>
              <li>• Upload the completed CSV file</li>
            </ul>
          </div>

          {/* Download Template */}
          <div>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 rounded-lg border border-blue-600 px-4 py-2 text-blue-600 hover:bg-blue-50"
            >
              <Download className="h-4 w-4" />
              Download CSV Template
            </button>
          </div>

          {/* File Upload Area */}
          {!result && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors
                ${file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400'}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {file ? (
                <div className="flex flex-col items-center">
                  <CheckCircle className="h-10 w-10 text-green-500" />
                  <p className="mt-2 font-medium text-green-700">{file.name}</p>
                  <p className="text-sm text-green-600">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <p className="mt-2 text-xs text-gray-500">Click to select a different file</p>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto h-10 w-10 text-gray-400" />
                  <p className="mt-2 text-gray-600">
                    <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
                  </p>
                  <p className="mt-1 text-sm text-gray-500">CSV files only</p>
                </>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <p className="text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Upload Result */}
          {result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className={`rounded-lg p-4 ${result.failed === 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                <div className="flex items-center gap-3">
                  {result.failed === 0 ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-yellow-600" />
                  )}
                  <div>
                    <h3 className={`font-medium ${result.failed === 0 ? 'text-green-800' : 'text-yellow-800'}`}>
                      Upload Complete
                    </h3>
                    <p className={`text-sm ${result.failed === 0 ? 'text-green-700' : 'text-yellow-700'}`}>
                      {result.successful} of {result.total_rows} customers created successfully
                    </p>
                  </div>
                </div>
              </div>

              {/* Errors List */}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <h4 className="font-medium text-red-800 mb-2">Errors ({result.errors.length})</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {result.errors.map((err, idx) => (
                      <div key={idx} className="text-sm text-red-700">
                        <span className="font-medium">Row {err.row}</span>
                        {err.field && <span className="text-red-600"> ({err.field})</span>}
                        : {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          
          {!result && (
            <button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload & Import
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BulkUploadModal

-- PDFs de pedido (html2canvas) podem ultrapassar 15MB; limite do bucket sobe para 50MB.
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'pedido-documentos';

import { supabase } from '../config/db.js';
import path from 'path';

export const getAllDocuments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type, category, query } = req.query;

    let dbQuery = supabase
      .from('documents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) {
      dbQuery = dbQuery.eq('status', status);
    }
    if (type) {
      dbQuery = dbQuery.eq('type', type);
    }
    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }
    if (query) {
      dbQuery = dbQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
    }

    const from = (page - 1) * limit;
    const to = from + parseInt(limit) - 1;

    dbQuery = dbQuery.range(from, to);

    const { data, error, count } = await dbQuery;

    if (error) {
      throw error;
    }

    res.json({
      documents: data || [],
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Failed to fetch documents', error: error.message });
  }
};

export const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Document not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ message: 'Failed to fetch document', error: error.message });
  }
};

export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};

    const fileExtension = path.extname(req.file.originalname).substring(1).toUpperCase();

    const documentData = {
      title: metadata.title || req.file.originalname,
      type: fileExtension,
      category: metadata.category || 'Other',
      status: 'pending',
      description: metadata.description || '',
      file_url: `/uploads/${req.file.filename}`,
      file_size: req.file.size,
      project: metadata.project || null,
      extracted_text: null
    };

    const { data, error } = await supabase
      .from('documents')
      .insert([documentData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ message: 'Failed to upload document', error: error.message });
  }
};

export const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Document not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ message: 'Failed to update document', error: error.message });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Failed to delete document', error: error.message });
  }
};

export const downloadDocumentLogic = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('documents')
      .select('file_url, title')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const filePath = path.join(process.cwd(), data.file_url);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${data.title}"`
    );

    res.sendFile(filePath);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ message: 'Failed to download document' });
  }
};

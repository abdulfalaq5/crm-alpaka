import { useState } from 'react';
import { Form, Input, Modal } from 'antd';

/**
 * Modal isian alasan/catatan. Bila `required`, alasan wajib diisi sebelum submit (BR-08).
 * onSubmit(value) harus mengembalikan promise; modal menutup bila sukses.
 */
export default function ReasonModal({ open, title, label, required = true, okText, danger, onSubmit, onCancel, placeholder }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await onSubmit(values.text?.trim() || '');
      form.resetFields();
    } catch (err) {
      if (err?.fields) form.setFields(err.fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      okText={okText || 'Kirim'}
      cancelText="Batal"
      okButtonProps={{ danger, loading: saving }}
      onOk={submit}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="text"
          label={label}
          rules={required ? [{ required: true, whitespace: true, message: `${label} wajib diisi` }] : []}
        >
          <Input.TextArea rows={4} maxLength={500} showCount placeholder={placeholder} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

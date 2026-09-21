import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errMsg } from './api';

/** Muat data dari API: { data, loading, error, reload }. `deps` memicu muat ulang. */
export function useLoad(url, params, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data } = await api.get(url, { params: paramsRef.current });
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: errMsg(err) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

/** Ambil file terproteksi (butuh token) sebagai blob URL untuk preview. */
export function useBlobUrl(path) {
  const [state, setState] = useState({ url: null, mime: null, loading: true, error: false });
  useEffect(() => {
    let active = true;
    let objectUrl;
    api
      .get(path, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(res.data);
        setState({ url: objectUrl, mime: res.data.type, loading: false, error: false });
      })
      .catch(() => active && setState({ url: null, mime: null, loading: false, error: true }));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return state;
}

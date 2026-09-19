export function useParams() {
  return { id: window.location.pathname.split('/').pop() };
}
export function useRouter() {
  return { back: () => window.history.back() };
}

/** A ticket's conversation page, where the composer owns the foot of the phone and no cart bar may cover it. */
export const isTicketConversationPath = (pathname: string) => /^\/support\/tickets\/[^/]+\/?$/.test(pathname);

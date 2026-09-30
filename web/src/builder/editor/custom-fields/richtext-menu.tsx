import { RichTextMenu } from '@puckeditor/core';

/** The toolbar: Puck's default minus alignment (the sanitiser drops `style`), plus strike, inline code and quote. */
export default function RichtextMenu() {
  return (
    <RichTextMenu>
      <RichTextMenu.Group>
        <RichTextMenu.HeadingSelect />
        <RichTextMenu.ListSelect />
      </RichTextMenu.Group>
      <RichTextMenu.Group>
        <RichTextMenu.Bold />
        <RichTextMenu.Italic />
        <RichTextMenu.Underline />
        <RichTextMenu.Strikethrough />
        <RichTextMenu.InlineCode />
      </RichTextMenu.Group>
      <RichTextMenu.Group>
        <RichTextMenu.Blockquote />
      </RichTextMenu.Group>
    </RichTextMenu>
  );
}

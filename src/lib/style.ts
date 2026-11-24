/// <reference lib="dom" />
/**
 * One CSS declaration, as text a `style` attribute or `.style` property can
 * take, built through the CSSOM.
 *
 * A component's inline style is one text. A value concatenated into it ends
 * its declaration at the first `;` and can add any other
 * (`red;position:fixed;…`): an element covering the page, a remote image
 * loaded. `setProperty` parses ONE value for the property and drops a value
 * the property refuses; the text returned is the CSSOM's own serialisation of
 * that one declaration, which reads back as exactly that declaration.
 *
 * Empty when the value is refused, and without a document (on the server,
 * where a `.style` binding is never written).
 */
export function styleDeclaration(property: string, value: string): string {
	if (typeof document === "undefined") return "";
	const probe = document.createElement("span").style;
	probe.setProperty(property, value);
	if (probe.getPropertyValue(property) === "") return "";
	return probe.cssText.trim().replace(/;$/, "");
}
